import * as core from '@actions/core';
import * as github from '@actions/github';

import { Err, Ok, Result } from './result';
import { plural } from './render';

type ChecksCreateParamsOutputAnnotations = any;

const pkg = require('../package.json');
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
    private annotations: Array<ChecksCreateParamsOutputAnnotations>;
    private stats: Stats;

    constructor() {
        this.annotations = [];
        this.stats = {
            file: 0,
            count: 0,
        };
    }

    public async check(outputs: Output[], options: CheckOptions): Promise<Result<void, string>> {
        // pretty
        if (outputs.length === 0) {
            return new Ok(undefined);
        }
        outputs.forEach(out => {
            const filename = out.name;
            this.stats.file += 1;
            out.mismatches.forEach(mismatch => {
                this.stats.count += 1;
                this.annotations.push(CheckRunner.makeAnnotation(filename, mismatch));
            });
        });
        const client = github.getOctokit(options.token, {
            userAgent: USER_AGENT,
        });
        let checkRunId: number;
        try {
            checkRunId = await this.createCheck(client, options);
        } catch (error) {
            // `GITHUB_HEAD_REF` is set only for forked repos,
            // so we could check if it is a fork and not a base repo.
            if (process.env.GITHUB_HEAD_REF) {
                core.error(`Unable to create clippy annotations! Reason: ${error}`);
                core.warning('It seems that this Action is executed from the forked repository.');
                core.warning(`GitHub Actions are not allowed to create Check annotations, \
when executed for a forked repos. \
See https://github.com/actions-rs/clippy-check/issues/2 for details.`);
                core.info('Posting clippy checks here instead.');

                this.dumpToStdout();

                // So, if there were any errors, we are considering this output
                // as failed, throwing an error will set a non-zero exit code later
                if (this.getConclusion() == 'failure') {
                    throw new Error('Exiting due to clippy errors');
                } else {
                    // Otherwise if there were no errors (and we do not care about warnings),
                    // exiting successfully.
                    return new Ok(undefined);
                }
            } else {
                return new Err(`${error}`);
            }
        }

        try {
            if (this.isSuccessCheck()) {
                await this.successCheck(client, checkRunId, options);
            } else {
                await this.runUpdateCheck(client, checkRunId, options);
            }
        } catch (error) {
            await this.cancelCheck(client, checkRunId, options);
            return new Err(`${error}`);
        }
        return new Ok(undefined);
    }

    private async createCheck(client: any, options: CheckOptions): Promise<number> {
        const response = await client.checks.create({
            owner: options.owner,
            repo: options.repo,
            name: options.name,
            head_sha: options.head_sha,
            status: 'in_progress',
        });
        // TODO: Check for errors

        return response.data.id as number;
    }

    private async runUpdateCheck(
        client: any,
        checkRunId: number,
        options: CheckOptions,
    ): Promise<void> {
        // Checks API allows only up to 50 annotations per request,
        // should group them into buckets
        let annotations = this.getBucket();
        while (annotations.length > 0) {
            // Request data is mostly the same for create/update calls
            let req: any = {
                owner: options.owner,
                repo: options.repo,
                name: options.name,
                check_run_id: checkRunId,
                output: {
                    title: options.name,
                    summary: this.getSummary(),
                    text: this.getText(options.context),
                    annotations: annotations,
                },
            };

            if (this.annotations.length > 0) {
                // There will be more annotations later
                core.debug('This is not the last iteration, marking check as "in_progress"');
                req.status = 'in_progress';
            } else {
                // Okay, that was a last one bucket
                const conclusion = this.getConclusion();
                core.debug(
                    `This is a last iteration, marking check as "completed", conclusion: ${conclusion}`,
                );
                req.status = 'completed';
                req.conclusion = conclusion;
                req.completed_at = new Date().toISOString();
            }

            // TODO: Check for errors
            await client.checks.update(req);

            annotations = this.getBucket();
        }

        return;
    }

    private async successCheck(
        client: any,
        checkRunId: number,
        options: CheckOptions,
    ): Promise<void> {
        let req: any = {
            owner: options.owner,
            repo: options.repo,
            name: options.name,
            check_run_id: checkRunId,
            status: 'completed',
            conclusion: this.getConclusion(),
            completed_at: new Date().toISOString(),
            output: {
                title: options.name,
                summary: this.getSummary(),
                text: this.getText(options.context),
            },
        };

        // TODO: Check for errors
        await client.checks.update(req);

        return;
    }

    /// Cancel whole check if some unhandled exception happened.
    private async cancelCheck(
        client: any,
        checkRunId: number,
        options: CheckOptions,
    ): Promise<void> {
        let req: any = {
            owner: options.owner,
            repo: options.repo,
            name: options.name,
            check_run_id: checkRunId,
            status: 'completed',
            conclusion: 'cancelled',
            completed_at: new Date().toISOString(),
            output: {
                title: options.name,
                summary: 'Unhandled error',
                text: 'Check was cancelled due to unhandled error. Check the Action logs for details.',
            },
        };

        // TODO: Check for errors
        await client.checks.update(req);

        return;
    }

    private dumpToStdout() {
        for (const annotation of this.annotations) {
            core.info(annotation.message);
        }
    }

    private getBucket(): Array<ChecksCreateParamsOutputAnnotations> {
        let annotations: Array<ChecksCreateParamsOutputAnnotations> = [];
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
        let blocks: string[] = [];

        if (this.stats.file > 0) {
            blocks.push(`${this.stats.file} file${plural(this.stats.file)}`);
        }
        if (this.stats.count > 0) {
            blocks.push(`${this.stats.count} count${plural(this.stats.count)}`);
        }

        return blocks.join(', ');
    }

    private getText(context: CheckOptions['context']): string {
        return `## Results
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

    private getConclusion(): string {
        if (this.stats.file > 0) {
            return 'failure';
        } else {
            return 'success';
        }
    }

    private isSuccessCheck(): boolean {
        return this.stats.file == 0 && this.stats.count == 0;
    }

    /// Convert parsed JSON line into the GH annotation object
    ///
    /// https://developer.github.com/v3/checks/runs/#annotations-object
    static makeAnnotation(path: string, contents: Mismatch): ChecksCreateParamsOutputAnnotations {
        let annotation: ChecksCreateParamsOutputAnnotations = {
            path: path,
            start_line: contents.original_begin_line,
            end_line: contents.original_begin_line,
            annotation_level: 'warning',
            title: 'rustfmt check',
            message: '```suggestion\n' + `${contents.expected}` + '\n```',
        };

        // Omit these parameters if `start_line` and `end_line` have different values.
        if (contents.original_begin_line == contents.original_begin_line) {
            annotation.start_column = 0;
            annotation.end_column = contents.original.length;
        }

        return annotation;
    }
}
