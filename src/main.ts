import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';

import * as input from './input';
import * as check from './check';
import { Result } from './result';

export async function run(actionInput: input.Input): Promise<Result<void, string>> {
    const startedAt = new Date().toISOString();

    let rustcVersion = '';
    let cargoVersion = '';
    let rustfmtVersion = '';
    await exec.exec('rustc', ['-V'], {
        silent: true,
        listeners: {
            stdout: (buffer: Buffer) => (rustcVersion = buffer.toString().trim()),
        },
    });
    await exec.exec('cargo', ['-V'], {
        silent: true,
        listeners: {
            stdout: (buffer: Buffer) => (cargoVersion = buffer.toString().trim()),
        },
    });
    await exec.exec('rustfmt', ['-V'], {
        silent: true,
        listeners: {
            stdout: (buffer: Buffer) => (rustfmtVersion = buffer.toString().trim()),
        },
    });

    let flags = ['--message-format=json'];
    actionInput.flags
        .filter(flag => !flag.startsWith('--check'))
        .filter(flag => !flag.startsWith('--message-format'))
        .forEach(flag => flags.push(flag));

    let options: string[] = [];
    actionInput.options.forEach(option => options.push(option));

    let args: string[] = [];
    actionInput.args.filter(arg => !arg.startsWith('--check')).forEach(arg => args.push(arg));

    let rustfmtOutput: string = '';
    try {
        core.startGroup('Executing cargo fmt (JSON output)');
        const execOutput = await exec.getExecOutput('cargo', ['fmt', ...flags, ...options, '--', ...args], {
            ignoreReturnCode: true,
        });
        // TODO:
        // We should handle exit code.
        if (execOutput.exitCode !== 0) {
            throw new Error(`Rustfmt had exited with the Exit Code ${execOutput.exitCode}:\n${execOutput.stderr}`);
        }
        rustfmtOutput = execOutput.stdout;
    } finally {
        core.endGroup();
    }

    let sha = github.context.sha;
    if (github.context.payload.pull_request?.head?.sha) {
        sha = github.context.payload.pull_request.head.sha;
    }
    let runner = new check.CheckRunner();
    const output = JSON.parse(rustfmtOutput) as check.Output[];
    const res = await runner.check(output, {
        token: actionInput.token,
        name: actionInput.name,
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        head_sha: sha,
        started_at: startedAt,
        context: {
            rustc: rustcVersion,
            cargo: cargoVersion,
            rustfmt: rustfmtVersion,
        },
    });
    return res;
}

async function main(): Promise<void> {
    try {
        const actionInput = input.get();
        const res = await run(actionInput);
        res.expect(e => `${e}`);
    } catch (error) {
        core.setFailed(`${error}`);
    }
}

main();
