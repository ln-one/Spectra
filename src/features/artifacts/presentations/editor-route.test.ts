import { expect, test } from "vitest";
import { presentationEditorHref } from "./editor-route";

test("builds a dedicated Presentation editor route", () => {
  expect(
    presentationEditorHref({
      artifactId: "00000000-0000-4000-8000-000000000001",
      conversationId: "00000000-0000-4000-8000-000000000002",
      workspaceId: "00000000-0000-4000-8000-000000000003",
    }),
  ).toBe(
    "/presentations/00000000-0000-4000-8000-000000000001?conversation=00000000-0000-4000-8000-000000000002&workspaceId=00000000-0000-4000-8000-000000000003",
  );
});
