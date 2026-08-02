import { expect, test } from "vitest";
import packageMetadata from "../../../../package.json";
import { ANIMATION_RENDERER_VERSION } from "./contract";

test("records the installed Remotion renderer version", () => {
  expect(packageMetadata.dependencies.remotion).toBe(
    packageMetadata.dependencies["@remotion/renderer"],
  );
  expect(ANIMATION_RENDERER_VERSION).toBe(`remotion-${packageMetadata.dependencies.remotion}`);
});
