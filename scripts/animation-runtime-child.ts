import path from "node:path";
import { executeAnimationPipelineChild } from "../src/features/artifacts/animations/pipeline.server";

const requestPath = process.argv[2];
if (!requestPath || !path.isAbsolute(requestPath)) {
  throw new Error("animation_runtime_child_request_invalid");
}

executeAnimationPipelineChild(requestPath).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
