import { expect, test } from "vitest";
import { classifyMinerUResults } from "./mineru-result";

function result(state: string, zipBytes: Uint8Array | null = null) {
  return [{ state, errCode: "", error: null, _zipBytes: zipBytes }];
}

test.each([
  "waiting-file",
  "pending",
  "running",
])("accepts the documented pending state %s", (state) => {
  expect(classifyMinerUResults(result(state))).toEqual({ kind: "pending" });
});

test("fails closed for an unknown provider state", () => {
  expect(classifyMinerUResults(result("mystery"))).toEqual({
    kind: "error",
    errorCode: "mineru_result_invalid",
    retryable: false,
  });
});

test("accepts a bounded ZIP result", () => {
  const zipBytes = new Uint8Array([0x50, 0x4b, 1, 2]);
  expect(classifyMinerUResults(result("done", zipBytes))).toEqual({ kind: "done", zipBytes });
});
