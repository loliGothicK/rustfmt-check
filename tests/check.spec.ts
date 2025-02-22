import { CheckRunner, OutputSchema } from "../src/check";
import { expect, test } from "@jest/globals";
import { outdent as indoc } from "outdent";
import {Result} from "neverthrow";
import type {OutputAnnotations} from "../src/types";

async function check(input: string): Promise<Result<undefined, { annotations: OutputAnnotations[]; stats: { file: number; count: number; }; }>> {
    const runner = new CheckRunner();

    const output = input.split("\n")
        .filter((line) => line.match(/^\[.*?]$/))
        .flatMap((line) => OutputSchema.parse(JSON.parse(line)));

    return await runner.check(output, "dry-run");
}

const PASS1 = String.raw`
[]
[]
`;

test("pass #1", async () => {
	const result = await check(PASS1);

	expect(result.isOk()).toBe(true);
});

const PASS2 = String.raw`
[]
`;

test("pass #2", async () => {
    const result = await check(PASS2);

    expect(result.isOk()).toBe(true);
});

const FAIL1 = "[{\"name\":\"/path/to/deriving_via/deriving_via_macros/src/lib.rs\",\"mismatches\":[{\"original_begin_line\":54,\"original_end_line\":56,\"expected_begin_line\":54,\"expected_end_line\":55,\"original\":\"    let ast = syn::parse(input)\\n        .unwrap();\\n    deriving_via::impl_deriving_via( &ast ).into()\\n\",\"expected\":\"    let ast = syn::parse(input).unwrap();\\n    deriving_via::impl_deriving_via(&ast).into()\\n\"}]}]";

const EXPECTED1 = indoc`
Diff in /path/to/deriving_via/deriving_via_macros/src/lib.rs:54:
${"```"}diff
-     let ast = syn::parse(input)
-         .unwrap();
-     deriving_via::impl_deriving_via( &ast ).into()
+     let ast = syn::parse(input).unwrap();
+     deriving_via::impl_deriving_via(&ast).into()
${"```"}
`;

test("fail #1", async () => {
    const result = await check(FAIL1);

    expect(result.isErr()).toBe(true);

    const { annotations, stats } = result._unsafeUnwrapErr();

    expect(stats.file).toBe(1);
    expect(stats.count).toBe(1);
    expect(annotations[0].message).toBe(EXPECTED1);
});
