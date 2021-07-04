import * as act_exec from '@actions/exec';
import { Result, Ok, Err } from './result';

export async function install(packages: string[]): Promise<Result<void, number>> {
    let exit_code = await act_exec.exec('cargo', packages, {
        silent: true,
    });
    if (exit_code === 0) {
        return new Ok(undefined);
    } else {
        return new Err(exit_code);
    }
}

export async function exec(
    component: string,
    args: string[],
    options: act_exec.ExecOptions,
): Promise<Result<void, number>> {
    let exit_code = await act_exec.exec('cargo', [component, ...args], options);
    if (exit_code === 0) {
        return new Ok(undefined);
    } else {
        return new Err(exit_code);
    }
}
