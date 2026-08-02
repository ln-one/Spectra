import { expect, test } from "vitest";
import { artifactGenerationReconciliationKey } from "./dbos";

test("scopes Artifact reconciliation identity to both Source and revision", () => {
  const revisionId = "00000000-0000-4000-8000-000000000501";

  expect(
    artifactGenerationReconciliationKey({
      artifactRevisionId: revisionId,
      sourceId: "00000000-0000-4000-8000-000000000502",
    }),
  ).not.toBe(
    artifactGenerationReconciliationKey({
      artifactRevisionId: revisionId,
      sourceId: "00000000-0000-4000-8000-000000000503",
    }),
  );
});
