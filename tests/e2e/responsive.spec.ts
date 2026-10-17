import { readFile } from "node:fs/promises";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { e2eAuthStatePath, e2eWorkspacePath } from "./environment";
import { gotoWithRetry, waitForPanelMinimums, waitForWorkbenchLayout } from "./workbench-readiness";

const viewports = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        body: document.body.scrollWidth - document.body.clientWidth,
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      })),
    )
    .toEqual({ body: 0, document: 0 });
}

async function expectInsideViewport(page: Page, target: Locator) {
  const [box, viewport] = await Promise.all([target.boundingBox(), page.viewportSize()]);
  if (!box || !viewport) throw new Error("Missing responsive target or viewport");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
}

function expectMinimumWithinOnePixel(actual: number, minimum: number) {
  expect(actual).toBeGreaterThanOrEqual(minimum - 1);
}

async function expectMinimumTargetSize(page: Page) {
  const undersizedTargets = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "a, button:not(:disabled), summary, textarea, input:not([type='radio']), label:has(input[type='radio']), [role='separator'][data-target-minimum-size]",
      ),
    ].flatMap((element) => {
      const style = getComputedStyle(element);
      // react-textarea-autosize keeps a hidden measurement textarea in the DOM; it is not an interactive target.
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        element.getAttribute("aria-hidden") === "true" ||
        element.tabIndex < 0
      ) {
        return [];
      }
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return [];
      if (
        element.getAttribute("role") === "separator" &&
        Number(element.dataset.targetMinimumSize) >= 24
      ) {
        return [];
      }
      if (box.width >= 24 && box.height >= 24) return [];
      return [
        { height: box.height, tag: element.tagName, text: element.innerText, width: box.width },
      ];
    }),
  );
  expect(undersizedTargets).toEqual([]);
}

test("keeps the marketing hero composed on a phone", async ({ browser }) => {
  const context = await browser.newContext({
    colorScheme: "dark",
    locale: "zh-CN",
    reducedMotion: "reduce",
    storageState: { cookies: [], origins: [] },
    viewport: { width: 375, height: 812 },
  });
  try {
    const page = await context.newPage();
    await page.goto("/");

    const hero = page.locator("[data-portal-hero]");
    const heading = hero.getByRole("heading", { level: 1 });
    await expect(hero).toBeVisible();
    await expectInsideViewport(page, hero);
    await expectInsideViewport(page, heading);
    const headingMetrics = await heading.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
    }));
    expect(headingMetrics.height).toBeLessThanOrEqual(headingMetrics.lineHeight + 1);
    const [heroBox, viewport] = await Promise.all([hero.boundingBox(), page.viewportSize()]);
    if (!heroBox || !viewport) throw new Error("Missing marketing hero geometry");
    expect(heroBox.x + heroBox.width / 2).toBeCloseTo(viewport.width / 2, 0);

    const decorativeCards = page.locator('[data-portal-source][data-mobile-hero-visible="true"]');
    const upperCards = page.locator(
      '[data-portal-source][data-mobile-hero-visible="true"][data-mobile-hero-zone="upper"]',
    );
    const lowerCards = page.locator(
      '[data-portal-source][data-mobile-hero-visible="true"][data-mobile-hero-zone="lower"]',
    );
    await expect(decorativeCards).toHaveCount(9);
    await expect(upperCards).toHaveCount(4);
    await expect(lowerCards).toHaveCount(5);
    for (const card of await upperCards.all()) {
      const cardBox = await card.boundingBox();
      if (!cardBox) throw new Error("Missing mobile source decoration");
      expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(heroBox.y);
    }
    const primaryAction = hero.getByRole("link", { name: "开始创作" });
    const secondaryAction = hero.getByRole("link", { name: "登录" });
    await expectInsideViewport(page, primaryAction);
    await expectInsideViewport(page, secondaryAction);
    const actionBoxes = await Promise.all([
      primaryAction.boundingBox(),
      secondaryAction.boundingBox(),
    ]);
    const actionBottom = Math.max(
      ...actionBoxes.map((box) => {
        if (!box) throw new Error("Missing marketing action geometry");
        return box.y + box.height;
      }),
    );
    for (const card of await lowerCards.all()) {
      const cardBox = await card.boundingBox();
      if (!cardBox) throw new Error("Missing lower mobile source decoration");
      expect(cardBox.y).toBeGreaterThanOrEqual(actionBottom);
    }

    const topGatherSlots = page.locator('[data-gather-slot][data-mobile-gather-zone="top"]');
    const sideGatherSlots = page.locator('[data-gather-slot][data-mobile-gather-zone="side"]');
    const bottomGatherSlots = page.locator('[data-gather-slot][data-mobile-gather-zone="bottom"]');
    await expect(topGatherSlots).toHaveCount(3);
    await expect(sideGatherSlots).toHaveCount(4);
    await expect(bottomGatherSlots).toHaveCount(2);
    const gatherTargets = await page.locator("[data-gather-slot]").evaluateAll((slots) =>
      slots.map((slot) => ({
        x: Number((slot as HTMLElement).dataset.mobileGatherX),
        y: Number((slot as HTMLElement).dataset.mobileGatherY),
        zone: (slot as HTMLElement).dataset.mobileGatherZone,
      })),
    );
    expect(gatherTargets.filter(({ zone }) => zone === "top").every(({ y }) => y < 0.3)).toBe(true);
    expect(
      gatherTargets.filter(({ zone }) => zone === "side").every(({ x }) => x < 0.1 || x > 0.9),
    ).toBe(true);
    expect(gatherTargets.filter(({ zone }) => zone === "bottom").every(({ y }) => y > 0.7)).toBe(
      true,
    );

    await expect(page.locator('[data-portal-tool][data-mobile-tool-column="left"]')).toHaveCount(3);
    await expect(page.locator('[data-portal-tool][data-mobile-tool-column="right"]')).toHaveCount(
      3,
    );
    await expect(
      page.locator('[data-portal-particle][data-mobile-particle-primary="true"]'),
    ).toHaveCount(9);
    await expect(
      page.locator('[data-portal-particle][data-mobile-particle-primary="false"]'),
    ).toHaveCount(9);
    const graphSurfaceColor = await page
      .locator("[data-portal-graph]")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    const portalColor = await page
      .locator("main")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(graphSurfaceColor).toBe(portalColor);
    expect(graphSurfaceColor).not.toBe("rgba(0, 0, 0, 0)");
    await expect(page.locator("[data-portal-graph-background]")).toHaveCSS(
      "background-image",
      /radial-gradient/,
    );
    const closingHeading = page.getByRole("heading", {
      name: "你的下一份作品，从这张网开始。",
    });
    const closingHeadingMetrics = await closingHeading.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
    }));
    expect(closingHeadingMetrics.height).toBeLessThanOrEqual(closingHeadingMetrics.lineHeight + 1);
    await expect(decorativeCards.first()).toHaveCSS("opacity", "0.24");
    await expectNoHorizontalOverflow(page);
    await expectMinimumTargetSize(page);
  } finally {
    await context.close();
  }
});

for (const viewport of viewports) {
  const label = `${viewport.width} by ${viewport.height}`;

  test(`keeps authentication pages usable at ${label}`, async ({ browser }) => {
    const context = await browser.newContext({
      colorScheme: "light",
      locale: "en-US",
      reducedMotion: "reduce",
      storageState: { cookies: [], origins: [] },
      viewport,
    });
    try {
      const page = await context.newPage();
      await page.goto("/auth/login");
      await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
      await expectInsideViewport(page, page.getByLabel("Email"));
      await expectNoHorizontalOverflow(page);
      await expectMinimumTargetSize(page);

      await page.goto("/auth/register");
      await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
      await page.getByLabel("Confirm password").scrollIntoViewIfNeeded();
      await expectInsideViewport(page, page.getByLabel("Confirm password"));
      await expectNoHorizontalOverflow(page);
      await expectMinimumTargetSize(page);
    } finally {
      await context.close();
    }
  });

  test(`keeps Dashboard and workspace creation usable at ${label}`, async ({ browser }) => {
    const context = await browser.newContext({
      colorScheme: "dark",
      locale: "en-US",
      reducedMotion: "reduce",
      storageState: e2eAuthStatePath,
      viewport,
    });
    try {
      const page = await context.newPage();
      await page.goto("/workspaces");
      const longWorkspace = page.getByText(
        "Interdisciplinary Computational Biology Research and Classroom Collaboration Workspace",
        { exact: true },
      );
      await longWorkspace.scrollIntoViewIfNeeded();
      await expect(longWorkspace).toBeVisible();
      await expectInsideViewport(page, longWorkspace);
      await expectInsideViewport(page, page.getByRole("heading", { name: "Workspaces", level: 1 }));
      await expectInsideViewport(page, page.getByRole("button", { name: /Filter/ }));
      await expectInsideViewport(page, page.getByRole("link", { name: "New" }));
      await page.getByLabel("Open account menu").click();
      await expectInsideViewport(page, page.getByText("spectra-e2e@example.com"));
      await expectNoHorizontalOverflow(page);
      await expectMinimumTargetSize(page);

      await page.goto("/workspaces/new");
      await page.getByLabel("Teaching idea").scrollIntoViewIfNeeded();
      await expectInsideViewport(page, page.getByLabel("Teaching idea"));
      await page.getByText("More options", { exact: true }).click();
      await page.getByText("Allow use by other projects", { exact: true }).scrollIntoViewIfNeeded();
      await expectInsideViewport(
        page,
        page.getByText("Allow use by other projects", { exact: true }),
      );
      await expectNoHorizontalOverflow(page);
      await expectMinimumTargetSize(page);
    } finally {
      await context.close();
    }
  });
}

test("uses drawer and contextual Workbench actions on a phone", async ({ page }) => {
  const fixture = JSON.parse(await readFile(e2eWorkspacePath, "utf8")) as {
    resumeUrl: string;
    url: string;
  };
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoWithRetry(page, fixture.url);

  await expect(page.getByTestId("mobile-workbench-navigation")).toHaveCount(0);
  await expect(page.getByTestId("chat-panel")).toBeVisible();
  await expect(page.getByTestId("studio-panel")).toBeHidden();
  await expect(page.getByTestId("sources-panel")).toBeHidden();

  const composer = page.getByPlaceholder("输入你的想法或任务");
  await composer.fill("保留这段移动端草稿");
  await composer.focus();
  await page.setViewportSize({ width: 375, height: 560 });
  await expectInsideViewport(page, composer);
  await page.setViewportSize({ width: 375, height: 812 });

  await page.getByRole("button", { name: "打开工作空间导航" }).click();
  await expect(page.getByRole("dialog", { name: "Spectra" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "工作空间" })).toBeVisible();
  await page.getByRole("button", { name: "关闭工作空间导航" }).click();

  await page.getByRole("button", { name: "打开添加菜单" }).click();
  await page.getByRole("menuitem", { name: /资料来源/ }).click();
  await expect(page.getByTestId("sources-panel")).toBeVisible();
  await expect(page.getByTestId("chat-panel")).toBeHidden();

  await page.getByRole("button", { name: "导入" }).click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "上传资料" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    buffer: Buffer.from("# 第一阶段移动端资料\n用于验证文件选择。"),
    mimeType: "text/markdown",
    name: "mobile-phase-one.md",
  });
  await expect(page.getByText("mobile-phase-one.md", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "返回对话" }).click();
  await expect(page.getByTestId("chat-panel")).toBeVisible();
  await expect(page.getByTestId("sources-panel")).toBeHidden();
  await expect(composer).toHaveValue("保留这段移动端草稿");

  await page.getByRole("button", { name: "打开工作空间导航" }).click();
  await page.getByRole("link", { name: "Refresh resume" }).click();
  await expect(page).toHaveURL(
    new RegExp(encodeURIComponent(fixture.resumeUrl.split("=").at(-1) ?? "")),
  );
  await gotoWithRetry(page, fixture.url);
  await expect(page.getByPlaceholder("输入你的想法或任务")).toHaveValue("保留这段移动端草稿");
  await expectNoHorizontalOverflow(page);
  await expectMinimumTargetSize(page);
});

test("keeps the focused Workbench flow usable on a tablet", async ({ page }) => {
  const fixture = JSON.parse(await readFile(e2eWorkspacePath, "utf8")) as { url: string };
  await page.setViewportSize({ width: 768, height: 1024 });
  await gotoWithRetry(page, fixture.url);

  await expect(page.getByTestId("chat-panel")).toBeVisible();
  await expect(page.getByTestId("studio-panel")).toBeHidden();
  await expect(page.getByTestId("sources-panel")).toBeHidden();
  await page.getByRole("button", { name: "打开添加菜单" }).click();
  await page.getByRole("menuitem", { name: /资料来源/ }).click();
  await expect(page.getByTestId("sources-panel")).toBeVisible();
  await page.getByRole("button", { name: "返回对话" }).click();
  await expect(page.getByPlaceholder("输入你的想法或任务")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectMinimumTargetSize(page);
});

test("keeps the phone Workbench usable in landscape", async ({ page }) => {
  const fixture = JSON.parse(await readFile(e2eWorkspacePath, "utf8")) as { url: string };
  await page.setViewportSize({ width: 812, height: 375 });
  await gotoWithRetry(page, fixture.url);

  const composer = page.getByPlaceholder("输入你的想法或任务");
  await expect(page.getByTestId("chat-panel")).toBeVisible();
  await expect(composer).toBeVisible();
  await expectInsideViewport(page, composer);
  await expectNoHorizontalOverflow(page);
});

test("keeps the desktop Workbench usable at 1024 by 768", async ({ page }) => {
  const fixture = JSON.parse(await readFile(e2eWorkspacePath, "utf8")) as { url: string };
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(fixture.url, { waitUntil: "domcontentloaded" });
  await waitForWorkbenchLayout(page);
  await waitForPanelMinimums(page, [
    { id: "studio-panel", pixels: 260 },
    { id: "chat-panel", pixels: 420 },
    { id: "sources-panel", pixels: 214 },
  ]);

  const panels = await Promise.all(
    ["studio-panel", "chat-panel", "sources-panel"].map(async (testId) => {
      const box = await page.locator(`[data-testid='${testId}']`).boundingBox();
      if (!box) throw new Error(`Missing ${testId}`);
      return box;
    }),
  );
  const [studio, chat, sources] = panels;
  if (!studio || !chat || !sources) throw new Error("Missing Workbench panels");
  expect(studio.x + studio.width).toBeLessThanOrEqual(chat.x);
  expect(chat.x + chat.width).toBeLessThanOrEqual(sources.x);
  expect(sources.x + sources.width).toBeLessThanOrEqual(1000);
  expectMinimumWithinOnePixel(studio.width, 260);
  expectMinimumWithinOnePixel(chat.width, 420);
  expectMinimumWithinOnePixel(sources.width, 214);
  for (const testId of ["studio-panel", "chat-panel", "sources-panel"]) {
    await expect(page.locator(`[data-testid='${testId}']`)).toBeVisible();
  }
  await expect(page.getByPlaceholder("输入你的想法或任务")).toBeVisible();
  await page.getByLabel("打开账户菜单").click();
  await expectInsideViewport(page, page.getByText("spectra-e2e@example.com"));
  await expectNoHorizontalOverflow(page);
  await expectMinimumTargetSize(page);
  await page.keyboard.press("Escape");

  const dictationButton = await page.getByRole("button", { name: "开始语音输入" }).boundingBox();
  if (!dictationButton) throw new Error("Missing dictation action");
  expect(dictationButton.width).toBeGreaterThanOrEqual(24);
  expect(dictationButton.height).toBeGreaterThanOrEqual(24);
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const) {
  test(`keeps the desktop Workbench usable at ${viewport.width} by ${viewport.height}`, async ({
    page,
  }) => {
    const fixture = JSON.parse(await readFile(e2eWorkspacePath, "utf8")) as { url: string };
    await page.setViewportSize(viewport);
    await gotoWithRetry(page, fixture.url);
    await waitForWorkbenchLayout(page);

    const panels = await Promise.all(
      ["studio-panel", "chat-panel", "sources-panel"].map(async (testId) => {
        const locator = page.getByTestId(testId);
        await expect(locator).toBeVisible();
        const box = await locator.boundingBox();
        if (!box) throw new Error(`Missing ${testId}`);
        return box;
      }),
    );
    const [studio, chat, sources] = panels;
    if (!studio || !chat || !sources) throw new Error("Missing Workbench panels");
    expect(studio.x + studio.width).toBeLessThanOrEqual(chat.x);
    expect(chat.x + chat.width).toBeLessThanOrEqual(sources.x);
    expect(sources.x + sources.width).toBeLessThanOrEqual(viewport.width - 24);
    await expect(page.getByPlaceholder("输入你的想法或任务")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectMinimumTargetSize(page);
  });
}
