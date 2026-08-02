import { expect, type Page } from "@playwright/test";

export async function waitForWorkbenchLayout(page: Page) {
  await expect(page.getByTestId("chat-panel")).toBeVisible({ timeout: 15_000 });
  const separators = page.locator(
    "[data-testid='studio-chat-resizer'], [data-testid='chat-sources-resizer']",
  );
  await expect(separators).toHaveCount(2, { timeout: 15_000 });
  for (const index of [0, 1]) {
    await expect(separators.nth(index)).toHaveAttribute("aria-valuenow", /\d+(?:\.\d+)?/, {
      timeout: 15_000,
    });
  }
}

export async function waitForPanelMinimums(page: Page, minimums: { id: string; pixels: number }[]) {
  await expect
    .poll(
      async () => {
        const boxes = await Promise.all(
          minimums.map(async ({ id }) => page.getByTestId(id).boundingBox()),
        );
        return boxes.every((box, index) => (box?.width ?? 0) >= (minimums[index]?.pixels ?? 0) - 1);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}
