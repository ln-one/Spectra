import { expect, test } from "vitest";
import { nearestSourcePanelHeight, sourcePanelHeightForRows } from "./ArtifactWorkbenchPanelLayout";

test("maps complete source rows to exact panel heights", () => {
  expect(sourcePanelHeightForRows(2)).toBe(187);
  expect(sourcePanelHeightForRows(3)).toBe(250);
  expect(sourcePanelHeightForRows(4)).toBe(313);
});

test("snaps source panel height to the nearest complete row", () => {
  expect(nearestSourcePanelHeight(220)).toBe(250);
  expect(nearestSourcePanelHeight(281)).toBe(250);
  expect(nearestSourcePanelHeight(282)).toBe(313);
  expect(nearestSourcePanelHeight(80)).toBe(187);
});
