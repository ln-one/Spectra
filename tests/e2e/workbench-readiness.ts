import { expect, type Page } from "@playwright/test";

export async function gotoWithRetry(
  page: Page,
  url: string,
  options: { attempts?: number; expectedUrl?: RegExp; timeout?: number } = {},
) {
  const attempts = options.attempts ?? 2;
  const timeout = options.timeout ?? 30_000;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await page.goto(url, { timeout, waitUntil: "commit" });
      if (!options.expectedUrl || options.expectedUrl.test(page.url())) return;
    } catch (error) {
      lastError = error;
    }

    if (attempt + 1 === attempts) break;
    await page.goto("about:blank", { timeout: 5_000, waitUntil: "commit" }).catch(() => undefined);
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(`Navigation did not reach the expected URL: ${url}`);
}

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
