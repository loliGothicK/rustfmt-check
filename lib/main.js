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
exports.run = void 0;
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const github = __importStar(require("@actions/github"));
const input = __importStar(require("./input"));
const check = __importStar(require("./check"));
async function run(actionInput) {
    const startedAt = new Date().toISOString();
    let rustcVersion = '';
    let cargoVersion = '';
    let rustfmtVersion = '';
    await exec.exec('rustc', ['-V'], {
        silent: true,
        listeners: {
            stdout: (buffer) => (rustcVersion = buffer.toString().trim()),
        },
    });
    await exec.exec('cargo', ['-V'], {
        silent: true,
        listeners: {
            stdout: (buffer) => (cargoVersion = buffer.toString().trim()),
        },
    });
    await exec.exec('rustfmt', ['-V'], {
        silent: true,
        listeners: {
            stdout: (buffer) => (rustfmtVersion = buffer.toString().trim()),
        },
    });
    let flags = ['--message-format=json'];
    actionInput.flags
        .filter(flag => !flag.startsWith('--check'))
        .filter(flag => !flag.startsWith('--message-format'))
        .forEach(flag => flags.push(flag));
    let options = [];
    actionInput.options.forEach(option => options.push(option));
    let args = [];
    actionInput.args.filter(arg => !arg.startsWith('--check')).forEach(arg => args.push(arg));
    let rustfmtOutput = '';
    try {
        core.startGroup('Executing cargo fmt (JSON output)');
        const execOutput = await exec.getExecOutput('cargo', ['fmt', ...flags, ...options, '--', ...args], {
            ignoreReturnCode: true,
        });
        if (execOutput.exitCode !== 0) {
            throw new Error(`Rustfmt had exited with the Exit Code ${execOutput.exitCode}:\n${execOutput.stderr}`);
        }
        rustfmtOutput = execOutput.stdout;
    }
    finally {
        core.endGroup();
    }
    let sha = github.context.sha;
    if (github.context.payload.pull_request?.head?.sha) {
        sha = github.context.payload.pull_request.head.sha;
    }
    let runner = new check.CheckRunner();
    const output = JSON.parse(rustfmtOutput);
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
exports.run = run;
async function main() {
    try {
        const actionInput = input.get();
        const res = await run(actionInput);
        res.expect(e => `${e}`);
    }
    catch (error) {
        core.setFailed(`${error}`);
    }
}
main();
