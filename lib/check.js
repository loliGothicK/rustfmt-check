"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckRunner = void 0;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const result_1 = require("./result");
const render_1 = require("./render");
const pkg = require('../package.json');
const USER_AGENT = `${pkg.name}/${pkg.version} (${pkg.bugs.url})`;
class CheckRunner {
    constructor() {
        this.annotations = [];
        this.stats = {
            file: 0,
            count: 0,
        };
    }
    async check(outputs, options) {
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
        let checkRunId;
        try {
            const response = await client.rest.checks.create({
                owner: options.owner,
                repo: options.repo,
                name: options.name,
                head_sha: options.head_sha,
                status: 'in_progress',
            });
            checkRunId = response.data.id;
        }
        catch (error) {
            if (process.env.GITHUB_HEAD_REF) {
                core.error(`Unable to create clippy annotations! Reason: ${error}`);
                core.warning('It seems that this Action is executed from the forked repository.');
                core.warning(`GitHub Actions are not allowed to create Check annotations, \
when executed for a forked repos. \
See https://github.com/actions-rs/clippy-check/issues/2 for details.`);
                core.info('Posting clippy checks here instead.');
                this.dumpToStdout();
                if (this.getConclusion() == 'failure') {
                    throw new Error('Exiting due to clippy errors');
                }
                else {
                    return new result_1.Ok(undefined);
                }
            }
            else {
                return new result_1.Err(`${error}`);
            }
        }
        if (outputs.length === 0) {
            await this.successCheck(client, checkRunId, options);
            return new result_1.Ok(undefined);
        }
        else {
            try {
                await this.runUpdateCheck(client, checkRunId, options);
                return new result_1.Err(`rustfmt check found unformatted ${this.stats.count} codes in ${this.stats.file} files.`);
            }
            catch (error) {
                await this.cancelCheck(client, checkRunId, options);
                return new result_1.Err(`${error}`);
            }
        }
    }
    async runUpdateCheck(client, checkRunId, options) {
        let annotations = this.getBucket();
        while (annotations.length > 0) {
            let req = {
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
                core.debug('This is not the last iteration, marking check as "in_progress"');
                req.status = 'in_progress';
            }
            else {
                const conclusion = this.getConclusion();
                core.debug(`This is a last iteration, marking check as "completed", conclusion: ${conclusion}`);
                req.status = 'completed';
                req.conclusion = conclusion;
                req.completed_at = new Date().toISOString();
            }
            await client.rest.checks.update(req);
            annotations = this.getBucket();
        }
        return;
    }
    async successCheck(client, checkRunId, options) {
        let req = {
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
        await client.rest.checks.update(req);
        return;
    }
    async cancelCheck(client, checkRunId, options) {
        let req = {
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
        await client.rest.checks.update(req);
        return;
    }
    dumpToStdout() {
        for (const annotation of this.annotations) {
            core.info(annotation.message);
        }
    }
    getBucket() {
        let annotations = [];
        while (annotations.length < 50) {
            const annotation = this.annotations.pop();
            if (annotation) {
                annotations.push(annotation);
            }
            else {
                break;
            }
        }
        core.debug(`Prepared next annotations bucket, ${annotations.length} size`);
        return annotations;
    }
    getSummary() {
        let blocks = [];
        if (this.stats.file > 0) {
            blocks.push(`${this.stats.file} file${(0, render_1.plural)(this.stats.file)}`);
        }
        if (this.stats.count > 0) {
            blocks.push(`${this.stats.count} count${(0, render_1.plural)(this.stats.count)}`);
        }
        return blocks.join(', ');
    }
    getText(context) {
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
    getConclusion() {
        if (this.stats.file > 0) {
            return 'failure';
        }
        else {
            return 'success';
        }
    }
    static makeAnnotation(path, contents) {
        let annotation = {
            path: path,
            start_line: contents.original_begin_line,
            end_line: contents.original_begin_line,
            annotation_level: 'warning',
            title: 'rustfmt check',
            message: 'Original:\n```\n' +
                `${contents.original}` +
                '\n```\nExpected:\n```\n' +
                `${contents.expected}` +
                '\n```',
        };
        if (contents.original_begin_line == contents.original_begin_line) {
            annotation.start_column = 0;
            annotation.end_column = contents.original.length;
        }
        return annotation;
    }
}
exports.CheckRunner = CheckRunner;
