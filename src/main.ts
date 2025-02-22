import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';

import * as input from './input';
import * as check from './check';
import { ok, err, type Result } from 'neverthrow';
import { throws } from 'node:assert';
import { OutputSchema } from './check';

async function getVersion(
    cmd: string[],
    toolchain: string,
): Promise<Result<string, string>> {
    const output = await exec.getExecOutput(
        'rustup',
        ['run', toolchain, ...cmd, '-V'],
        {
            silent: true,
        },
    );
    if (output.exitCode !== 0) {
        return err(output.stderr);
    }
    return ok(output.stdout);
}

export async function run(
    actionInput: input.Input,
): Promise<Result<void, string>> {
    const startedAt = new Date().toISOString();
    let rustcVersion = '';
    {
        const ver = await getVersion(['rustc'], actionInput.toolchain);
        if (ver.isErr()) {
            return err(ver.error);
        }
        rustcVersion = ver.value;
    }
    let cargoVersion = '';
    {
        const ver = await getVersion(['cargo'], actionInput.toolchain);
        if (ver.isErr()) {
            return err(ver.error);
        }
        cargoVersion = ver.value;
    }
    let rustfmtVersion = '';
    {
        const ver = await getVersion(['rustfmt'], actionInput.toolchain);
        if (ver.isErr()) {
            return err(ver.error);
        }
        rustfmtVersion = ver.value;
    }

    const flags = ['--message-format=json'];
    for (const flag of actionInput.flags
        .filter(f => !f.startsWith('--check'))
        .filter(f => !f.startsWith('--message-format'))) {
        flags.push(flag);
    }

    const options: string[] = actionInput.options;

    const args: string[] = actionInput.args.filter(
        arg => !arg.startsWith('--check'),
    );

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
                actionInput.toolchain,
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

    const sha =
        github.context.payload.pull_request?.head?.sha || github.context.sha;
    const runner = new check.CheckRunner();

    // workaround for multiple outputs bug
    const output = rustfmtOutput
        .split('\n')
        .filter(line => line.match(/^\[.*?]$/))
        .flatMap(line => OutputSchema.parse(JSON.parse(line)));

    const checkResult = await runner.check(output, {
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

    return checkResult.andThen(() => {
        if (rustfmtExitCode !== 0) {
            return err(
                `Rustfmt had exited with the ${rustfmtExitCode} exit code:\n${stdErr}`,
            );
        }
        return ok(undefined);
    });
}

async function main(): Promise<void> {
    const actionInput = input.get();
    const res = await run(actionInput);
    if (res.isErr()) core.setFailed(`${res.error}`);
}

main()
    .then(r => r)
    .catch(e => throws(e));
