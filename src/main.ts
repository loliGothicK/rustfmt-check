import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';

import * as input from './input';
import * as check from './check';
import { Err, Ok, Result } from './result';

async function getVersion(cmd: string[], toolchain: string): Promise<Result<string, string>> {
    const output = await exec.getExecOutput('rustup', ['run', toolchain, ...cmd, '-V'], {
        silent: true,
    });
    if (output.exitCode !== 0) {
        return new Err(output.stderr);
    }
    return new Ok(output.stdout);
}

export async function run(actionInput: input.Input): Promise<Result<void, string>> {
    const startedAt = new Date().toISOString();
    const toolchain = actionInput.toolchain === undefined ? 'stable' : actionInput.toolchain;
    let rustcVersion = '';
    {
        const v = await getVersion(['rustc'], actionInput.toolchain);
        if (v.isErr()) {
            return v;
        } else {
            rustcVersion = v.unwrap();
        }
    }
    let cargoVersion = '';
    {
        const v = await getVersion(['cargo'], actionInput.toolchain);
        if (v.isErr()) {
            return v;
        } else {
            cargoVersion = v.unwrap();
        }
    }
    let rustfmtVersion = '';
    {
        const v = await getVersion(['rustfmt'], actionInput.toolchain);
        if (v.isErr()) {
            return v;
        } else {
            rustfmtVersion = v.unwrap();
        }
    }

    const flags = ['--message-format=json'];
    for (const flag of actionInput.flags
        .filter(f => !f.startsWith('--check'))
        .filter(f => !f.startsWith('--message-format'))) {
        flags.push(flag);
    }

    const options: string[] = actionInput.options;

    const args: string[] = actionInput.args.filter(arg => !arg.startsWith('--check'));

    const manifestPath: string = actionInput.workingDirectory.endsWith('/')
        ? `${actionInput.workingDirectory}Cargo.toml`
        : `${actionInput.workingDirectory}/Cargo.toml`;

    let rustfmtOutput = '';
    let stdErr = '';
    let rustfmtExitCode = 0;

    try {
        core.startGroup('Executing cargo fmt (JSON output)');
        const execOutput = await exec.getExecOutput(
            'rustup',
            [
                'run',
                toolchain,
                'cargo',
                'fmt',
                ...flags,
                ...options,
                `--manifest-path=${manifestPath}`,
                '--',
                ...args,
            ],
            {
                ignoreReturnCode: true,
            },
        );
        if (execOutput.exitCode !== 0) {
            throw new Error(
                `Rustfmt had exited with the Exit Code ${execOutput.exitCode}:\n${execOutput.stderr}`,
            );
        }
        rustfmtOutput = execOutput.stdout;
        stdErr = execOutput.stderr;
        rustfmtExitCode = execOutput.exitCode;
    } finally {
        core.endGroup();
    }

    let sha = github.context.sha;
    if (github.context.payload.pull_request?.head?.sha) {
        sha = github.context.payload.pull_request.head.sha;
    }
    const runner = new check.CheckRunner();
    const output = JSON.parse(rustfmtOutput) as check.Output[];
    await runner.check(output, {
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

    if (rustfmtExitCode !== 0) {
        return new Err(`Clippy had exited with the ${rustfmtExitCode} exit code:\n${stdErr}`);
    }
    return new Ok(undefined);
}

async function main(): Promise<void> {
    const actionInput = input.get();
    const res = await run(actionInput);
    if (res.type === 'failure') core.setFailed(`${res.unwrap_err()}`);
}

main();
