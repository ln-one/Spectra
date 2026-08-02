import { expect, test } from "vitest";
import { evidenceContentSchema } from "./schemas";

test("accepts only the canonical visual asset contract", () => {
  expect(
    evidenceContentSchema.parse({
      kind: "visual_region",
      asset: { kind: "ingestion_archive_entry", path: "images/region.png" },
    }),
  ).toEqual({
    kind: "visual_region",
    asset: { kind: "ingestion_archive_entry", path: "images/region.png" },
  });

  expect(
    evidenceContentSchema.safeParse({
      kind: "visual_region",
      assetPath: "images/region.png",
    }).success,
  ).toBe(false);
});
