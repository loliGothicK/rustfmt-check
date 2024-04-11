import * as core from "@actions/core";
import * as github from "@actions/github";
import { outdent as indoc } from "outdent";

import { Err, Ok, type Result } from "./result";
import { plural } from "./render";

import pkg from "../package.json";
import type { Conclusion, OutputAnnotations, RequestData } from "./types";

const USER_AGENT = `${pkg.name}/${pkg.version} (${pkg.bugs.url})`;

interface CheckOptions {
	token: string;
	owner: string;
	repo: string;
	name: string;
	head_sha: string;
	started_at: string; // ISO8601
	context: {
		rustc: string;
		cargo: string;
		rustfmt: string;
	};
}

export interface Mismatch {
	original_begin_line: number;
	original_end_line: number;
	expected_begin_line: number;
	expected_end_line: number;
	original: string;
	expected: string;
}

export interface Output {
	name: string;
	mismatches: Mismatch[];
}

interface Stats {
	file: number;
	count: number;
}

export class CheckRunner {
	private readonly annotations: OutputAnnotations[];
	private stats: Stats;

	constructor() {
		this.annotations = [];
		this.stats = {
			file: 0,
			count: 0,
		};
	}

	async check(
		outputs: Output[],
		options: CheckOptions,
	): Promise<Result<void, string>> {
		for (const out of outputs) {
			const filename = out.name;
			this.stats.file += 1;
			for (const mismatch of out.mismatches) {
				this.stats.count += 1;
				this.annotations.push(CheckRunner.makeAnnotation(filename, mismatch));
			}
		}
		const client = github.getOctokit(options.token, {
			userAgent: USER_AGENT,
		});
		let checkRunId: number;
		try {
			const response = await client.rest.checks.create({
				owner: options.owner,
				repo: options.repo,
				name: options.name,
				head_sha: options.head_sha,
				status: "in_progress",
			});
			checkRunId = response.data.id;
		} catch (error) {
			// `GITHUB_HEAD_REF` is set only for forked repos,
			// so we could check if it is a fork and not a base repo.
			if (process.env.GITHUB_HEAD_REF) {
				core.error(`Unable to create clippy annotations! Reason: ${error}`);
				core.warning(
					"It seems that this Action is executed from the forked repository.",
				);
				core.warning(indoc`
                  GitHub Actions are not allowed to create Check annotations,
                  when executed for a forked repos.
                  See https://github.com/actions-rs/clippy-check/issues/2 for details.`);
				core.info("Posting clippy checks here instead.");

				this.dumpToStdout();

				// So, if there were any errors, we are considering this output
				// as failed, throwing an error will set a non-zero exit code later
				if (this.getConclusion() === "failure") {
					throw new Error("Exiting due to clippy errors");
				}
				// Otherwise if there were no errors (and we do not care about warnings),
				// exiting successfully.
				return new Ok(undefined);
			}
			return new Err(`${error}`);
		}

		if (outputs.length === 0) {
			await this.successCheck(client, checkRunId, options);
			return new Ok(undefined);
		}
		try {
			await this.runUpdateCheck(client, checkRunId, options);
			return new Err(
				`rustfmt check found unformatted ${this.stats.count} codes in ${this.stats.file} files.`,
			);
		} catch (error) {
			await this.cancelCheck(client, checkRunId, options);
			return new Err(`${error}`);
		}
	}

	private async runUpdateCheck(
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		client: any,
		checkRunId: number,
		options: CheckOptions,
	): Promise<void> {
		// Checks API allows only up to 50 annotations per request,
		// should group them into buckets
		let annotations = this.getBucket();
		while (annotations.length > 0) {
			// Request data is mostly the same for create/update calls
			const req: RequestData = {
				owner: options.owner,
				repo: options.repo,
				name: options.name,
				check_run_id: checkRunId,
				output: {
					title: options.name,
					summary: this.getSummary(),
					text: this.getText(options.context),
					annotations,
				},
			};

			if (this.annotations.length > 0) {
				// There will be more annotations later
				core.debug(
					'This is not the last iteration, marking check as "in_progress"',
				);
				req.status = "in_progress";
			} else {
				// Okay, that was a last one bucket
				const conclusion = this.getConclusion();
				core.debug(
					`This is a last iteration, marking check as "completed", conclusion: ${conclusion}`,
				);
				req.status = "completed";
				req.conclusion = conclusion;
				req.completed_at = new Date().toISOString();
			}

			// TODO: Check for errors
			await client.rest.checks.update(req);

			annotations = this.getBucket();
		}

		return;
	}

	private async successCheck(
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		client: any,
		checkRunId: number,
		options: CheckOptions,
	): Promise<void> {
		// TODO: Check for errors
		const response = await client.rest.checks.update({
			owner: options.owner,
			repo: options.repo,
			check_run_id: checkRunId,
			name: options.name,
			status: "completed",
			conclusion: this.getConclusion(),
			completed_at: new Date().toISOString(),
			output: {
				title: options.name,
				summary: this.getSummary(),
				text: this.getText(options.context),
			},
		});

		if (response.status) {
			return;
		}

		return;
	}

	/// Cancel whole check if some unhandled exception happened.
	private async cancelCheck(
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		client: any,
		checkRunId: number,
		options: CheckOptions,
	): Promise<void> {
		const req: RequestData = {
			owner: options.owner,
			repo: options.repo,
			name: options.name,
			check_run_id: checkRunId,
			status: "completed",
			conclusion: "cancelled",
			completed_at: new Date().toISOString(),
			output: {
				title: options.name,
				summary: "Unhandled error",
				text: "Check was cancelled due to unhandled error. Check the Action logs for details.",
			},
		};

		// TODO: Check for errors
		await client.rest.checks.update(req);

		return;
	}

	private dumpToStdout(): void {
		for (const annotation of this.annotations) {
			core.info(annotation.message);
		}
	}

	private getBucket(): OutputAnnotations[] {
		const annotations: OutputAnnotations[] = [];
		while (annotations.length < 50) {
			const annotation = this.annotations.pop();
			if (annotation) {
				annotations.push(annotation);
			} else {
				break;
			}
		}

		core.debug(`Prepared next annotations bucket, ${annotations.length} size`);

		return annotations;
	}

	private getSummary(): string {
		const blocks: string[] = [];

		if (this.stats.file > 0) {
			blocks.push(`${this.stats.file} file${plural(this.stats.file)}`);
		}
		if (this.stats.count > 0) {
			blocks.push(`${this.stats.count} count${plural(this.stats.count)}`);
		}

		return blocks.join(", ");
	}

	private getText(context: CheckOptions["context"]): string {
		return indoc`
            ## Results

            | Format checked          | Amount                |
            | ----------------------- | --------------------- |
            | Files                   | ${this.stats.file}    |
            | Count                   | ${this.stats.count}   |

            ## Versions

            * ${context.rustc}
            * ${context.cargo}
            * ${context.rustfmt}
        `;
	}

	private getConclusion(): Conclusion {
		return this.stats.file > 0 ? "failure" : "success";
	}

	/// Convert parsed JSON line into the GH annotation object
	///
	/// https://docs.github.com/en/rest/reference/checks#update-a-check-run
	static makeAnnotation(path: string, contents: Mismatch): OutputAnnotations {
		const codeBlock = (code: string): string => {
			return `
              \`\`\`
              ${code}
              \`\`\`
            `;
		};
		const annotation: OutputAnnotations = {
			path,
			start_line: contents.original_begin_line,
			end_line: contents.original_begin_line,
			annotation_level: "warning",
			title: "rustfmt check",
			message: indoc`
                Original:
                ${codeBlock(contents.original)}
                Expected:
                ${codeBlock(contents.expected)}
            `,
		};

		// Omit these parameters if `start_line` and `end_line` have different values.
		return contents.original_begin_line === contents.original_end_line
			? annotation
			: Object.assign(
					annotation,
					{ start_column: 0 },
					{ end_column: contents.original.length },
				);
	}
}
