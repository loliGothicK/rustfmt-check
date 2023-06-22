import stringArgv from 'string-argv';
import * as core from '@actions/core';

// Parsed action input
export interface Input {
    token: string;
    toolchain: string;
    flags: string[];
    options: string[];
    args: string[];
    name: string;
    workingDirectory: string;
}

export function get(): Input {
    const token = core.getInput('token', { required: true });
    const toolchain = core.getInput('toolchain', { required: false });
    const flags = stringArgv(core.getInput('flags', { required: false }));
    const options = stringArgv(core.getInput('options', { required: false }));
    const args = stringArgv(core.getInput('args', { required: false }));
    const name = core.getInput('name', { required: false });
    const workingDirectory = core.getInput('working-directory', { required: false });
    return {
        token,
        toolchain,
        flags,
        options,
        args,
        name,
        workingDirectory,
    };
}
