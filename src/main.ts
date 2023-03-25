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

    const flags = ['--message-format=json'];
    for (const flag of actionInput.flags
        .filter(f => !f.startsWith('--check'))
        .filter(f => !f.startsWith('--message-format'))) {
        flags.push(flag);
    }

    const options: string[] = actionInput.options;

    const args: string[] = actionInput.args.filter(arg => !arg.startsWith('--check'));

    let rustfmtOutput = '';
    try {
        core.startGroup('Executing cargo fmt (JSON output)');
        const execOutput = await exec.getExecOutput(
            'cargo',
            ['fmt', ...flags, ...options, '--', ...args],
            {
                ignoreReturnCode: true,
            },
        );
        // TODO:
        // We should handle exit code.
        if (execOutput.exitCode !== 0) {
            throw new Error(
                `Rustfmt had exited with the Exit Code ${execOutput.exitCode}:\n${execOutput.stderr}`,
            );
        }
        rustfmtOutput = execOutput.stdout;
    } finally {
        core.endGroup();
    }

    let sha = github.context.sha;
    if (github.context.payload.pull_request?.head?.sha) {
        sha = github.context.payload.pull_request.head.sha;
    }
    const runner = new check.CheckRunner();
    const output = JSON.parse(rustfmtOutput) as check.Output[];
    return await runner.check(output, {
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
