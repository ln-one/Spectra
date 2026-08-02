import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  UI_MESSAGE_STREAM_HEADERS,
} from "ai";
import { numberedKnowledgeEvidenceData } from "../../src/features/agents/knowledge-citation-contract";
import {
  type MindMapRevisionContent,
  mindMapRevisionContentSchema,
} from "../../src/features/artifacts/mind-maps/contract";
import { knowledgeStructuredContentHash } from "../../src/features/knowledge/integrity";
import { expectNoSeriousAccessibilityViolations } from "./accessibility";
import { e2eBaseUrl, e2eOtherAuthStatePath, e2eWorkspacePath } from "./environment";
import { waitForWorkbenchLayout } from "./workbench-readiness";

let fixtureUrl: string;
let fixture: {
  artifactId: string;
  mindMapArtifactId: string;
  conversationId: string;
  resumeConversationId: string;
  resumeUrl: string;
  url: string;
  workspaceId: string;
  aliasedId: string;
  prettyUrl: string;
};

type Box = { height: number; width: number; x: number; y: number };

function expectBoxWithinOnePixel(actual: Box, expected: Box) {
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(actual[key] - expected[key])).toBeLessThanOrEqual(1);
  }
}

async function tabUntilFocused(page: Page, target: Locator, maximumTabs = 8) {
  for (let index = 0; index < maximumTabs; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Target was not reachable within ${maximumTabs} Tab presses`);
}

async function waitForStableScroll(locator: Locator) {
  await locator.evaluate(async (element) => {
    let last = element.scrollTop;
    let stableFrames = 0;
    while (stableFrames < 5) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const current = element.scrollTop;
      stableFrames = Math.abs(current - last) < 0.5 ? stableFrames + 1 : 0;
      last = current;
    }
  });
}

async function expectWholeSourceRows(page: Page, expectedRows: number) {
  const geometry = await page.evaluate((rowCount) => {
    const panel = document.querySelector("[data-testid='sources-panel']");
    const items = [...document.querySelectorAll(".workspace-sources-rail-item")];
    if (!panel || items.length <= rowCount) throw new Error("Missing Source row geometry");
    const panelBox = panel.getBoundingClientRect();
    return {
      nextTop: items[rowCount]?.getBoundingClientRect().top,
      panelBottom: panelBox.bottom,
      visible: items.slice(0, rowCount).map((item) => {
        const box = item.getBoundingClientRect();
        return { bottom: box.bottom, top: box.top };
      }),
    };
  }, expectedRows);
  for (const row of geometry.visible) {
    expect(row.top).toBeGreaterThanOrEqual(0);
    expect(row.bottom).toBeLessThanOrEqual(geometry.panelBottom);
  }
  expect(geometry.nextTop).toBeGreaterThanOrEqual(geometry.panelBottom);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
});

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(e2eWorkspacePath, "utf8"));
  fixtureUrl = fixture.url;
});

test("resolves UUID and pretty workspace addresses", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`/workspaces/${fixture.aliasedId}`);
  await expect(page).toHaveURL(new RegExp(`${fixture.prettyUrl}\\?conversation=[0-9a-f-]{36}$`));
  await expect(page.getByRole("heading", { name: "Spectra Materials Lab" })).toBeVisible();
});

test("opens the sharing model without exposing private work", async ({ page }) => {
  const slug = `sharing-${crypto.randomUUID()}`;
  await page.goto(fixtureUrl);
  await page.getByRole("button", { name: "分享", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "分享工作空间" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("共享正式资料与成果；每个人的对话、历史和私人创作彼此隔离。"),
  ).toBeVisible();
  await dialog.getByRole("textbox", { name: "先建立分享地址" }).fill(slug);
  await dialog.getByRole("button", { name: "建立" }).click();

  const restrictedVisibility = dialog.getByRole("button", { name: "受限" });
  const publicVisibility = dialog.getByRole("button", { name: "公开" });
  const allowReferences = dialog.getByRole("button", { name: "允许" });
  await expect(restrictedVisibility).toHaveAttribute("aria-pressed", "true");
  await expect(publicVisibility).toHaveAttribute("aria-pressed", "false");
  await expect(allowReferences).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByRole("button", { name: "复制链接" })).toBeHidden();
  await expect(dialog.getByText(`${e2eBaseUrl}/spectra-e2e/${slug}`)).toBeHidden();
  await publicVisibility.click();
  await expect(publicVisibility).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByText(`${e2eBaseUrl}/spectra-e2e/${slug}`)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "复制链接" })).toBeVisible();
  await expect(dialog.getByText("共享仅包含资料来源，不包括对话、历史和个人创作。")).toBeVisible();
  await allowReferences.click();
  await expect(allowReferences).toHaveAttribute("aria-pressed", "true");
  await restrictedVisibility.click();
  await expect(restrictedVisibility).toHaveAttribute("aria-pressed", "true");
  await expect(allowReferences).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByText(`${e2eBaseUrl}/spectra-e2e/${slug}`)).toBeHidden();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("hides a private workspace from another owner", async ({ browser }) => {
  const context = await browser.newContext({ storageState: e2eOtherAuthStatePath });
  const page = await context.newPage();
  await page.goto(`/workspaces/${fixture.workspaceId}`);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await context.close();
});

test("redirects 127.0.0.1 to localhost without losing the port", async ({ page }) => {
  const { port } = new URL(e2eBaseUrl);
  await page.goto(`http://127.0.0.1:${port}/workspaces`);
  await expect(page).toHaveURL(`${e2eBaseUrl}/workspaces`);
});

test("keeps the approved panel geometry without business requests", async ({ page }) => {
  const runtimeErrors: string[] = [];
  const businessRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    const isBusinessTransport =
      request.resourceType() === "fetch" || request.resourceType() === "xhr";
    if (isBusinessTransport && (url.pathname.startsWith("/api/") || url.hostname !== "localhost")) {
      businessRequests.push(request.url());
    }
  });

  await page.goto(fixtureUrl, { waitUntil: "networkidle" });
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");

  const regions = await page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      if (!rect) throw new Error(`Missing visual region: ${selector}`);
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return {
      header: box("header"),
      studio: box("[data-testid='studio-panel']"),
      chat: box("[data-testid='chat-panel']"),
      sources: box("[data-testid='sources-panel']"),
    };
  });

  expectBoxWithinOnePixel(regions.header, { x: 0, y: 0, width: 1440, height: 64 });
  expectBoxWithinOnePixel(regions.studio, { x: 24, y: 64, width: 330, height: 812 });
  expectBoxWithinOnePixel(regions.chat, {
    x: 366,
    y: 64,
    width: 736.796875,
    height: 812,
  });
  expectBoxWithinOnePixel(regions.sources, {
    x: 1114.796875,
    y: 64,
    width: 301.1875,
    height: 812,
  });
  expect(runtimeErrors).toEqual([]);
  expect(businessRequests).toEqual([]);
});

test("applies stable Studio identities and the document tone in light and dark modes", async ({
  page,
}) => {
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });

  const workspaceRoot = page.locator("[data-workspace-theme]");
  await expect(workspaceRoot).toHaveAttribute("data-studio-tone", "neutral");
  expect(
    await page
      .getByTestId("studio-panel")
      .locator(".workspace-tool-card")
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-studio-tone"))),
  ).toEqual(["orange", "blue", "teal", "rose", "violet", "green"]);
  await expect(
    page.getByTestId("studio-panel").locator(".workspace-tool-card .workspace-tool-icon-container"),
  ).toHaveCount(6);
  await expect(
    page
      .getByTestId("studio-panel")
      .locator('.workspace-tool-card[data-studio-tone="blue"] .workspace-tool-icon-container svg'),
  ).toHaveAttribute("stroke-width", "2.25");

  await page
    .getByTestId("studio-panel")
    .locator('.workspace-tool-card[data-studio-tone="blue"]')
    .click();
  await expect(workspaceRoot).toHaveAttribute("data-studio-tone", "blue");
  expect(
    await workspaceRoot.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--studio-emphasis").trim(),
    ),
  ).toBe("#2563eb");
  await expect(page.getByTestId("chat-panel")).toHaveClass(/workspace-assistant-tone-panel/);
  await expect(page.getByTestId("teaching-document-workspace")).toHaveClass(
    /workspace-artifact-tone-panel/,
  );

  await page.getByRole("button", { name: "返回备课工坊" }).click();
  await expect(workspaceRoot).toHaveAttribute("data-studio-tone", "neutral");

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByTestId("studio-panel")
    .locator('.workspace-tool-card[data-studio-tone="blue"]')
    .click();
  expect(
    await workspaceRoot.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--studio-accent-text").trim(),
    ),
  ).toBe("#60a5fa");
});

test("loads target-specific Presentation, Animation, Word, Mind Map, and Quiz suggestions through the shared endpoint", async ({
  page,
}) => {
  const requestedTargets: string[] = [];
  await page.route("**/api/artifacts/suggestions**", async (route) => {
    const target = new URL(route.request().url()).searchParams.get("target") ?? "unknown";
    requestedTargets.push(target);
    await route.fulfill({
      contentType: "application/json",
      json: {
        status: "fresh",
        suggestions: Array.from({ length: 4 }, (_, index) => ({
          prompt: `${target} prompt ${index + 1}`,
          title: `${target} suggestion ${index + 1}`,
        })),
      },
    });
  });
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });

  await page
    .getByTestId("studio-panel")
    .locator('.workspace-tool-card[data-studio-tone="orange"]')
    .click();
  await expect(page.getByText("presentation suggestion 1", { exact: true })).toBeVisible();
  await expect(page.getByText(/presentation suggestion/)).toHaveCount(4);
  await expect(page.getByRole("button", { name: "重新生成建议" })).toBeVisible();
  await page.getByRole("button", { name: "返回备课工坊" }).click();

  await page
    .getByTestId("studio-panel")
    .locator('.workspace-tool-card[data-studio-tone="green"]')
    .click();
  await expect(page.getByText("animation suggestion 1", { exact: true })).toBeVisible();
  await expect(page.getByText(/animation suggestion/)).toHaveCount(4);
  await expect(page.getByRole("button", { name: "重新生成建议" })).toBeVisible();
  await page.getByRole("button", { name: "返回备课工坊" }).click();

  await page
    .getByTestId("studio-panel")
    .locator('.workspace-tool-card[data-studio-tone="blue"]')
    .click();
  await expect(page.getByText("teaching_document suggestion 1", { exact: true })).toBeVisible();
  await expect(page.getByText(/teaching_document suggestion/)).toHaveCount(4);
  await expect(page.getByRole("button", { name: "重新生成建议" })).toBeVisible();
  await page.getByRole("button", { name: "返回备课工坊" }).click();

  await page
    .getByTestId("studio-panel")
    .locator('.workspace-tool-card[data-studio-tone="teal"]')
    .click();
  await expect(page.getByText("mind_map suggestion 1", { exact: true })).toBeVisible();
  await expect(page.getByText(/mind_map suggestion/)).toHaveCount(4);
  await expect(page.getByRole("button", { name: "重新生成建议" })).toBeVisible();
  await page.getByRole("button", { name: "返回备课工坊" }).click();

  await page
    .getByTestId("studio-panel")
    .locator('.workspace-tool-card[data-studio-tone="violet"]')
    .click();
  await expect(page.getByText("quiz suggestion 1", { exact: true })).toBeVisible();
  await expect(page.getByText(/quiz suggestion/)).toHaveCount(4);
  await expect(page.getByRole("button", { name: "重新生成建议" })).toBeVisible();
  await page.getByRole("button", { name: /quiz suggestion 1/ }).click();
  await expect(page.getByPlaceholder("输入你的想法或任务")).toHaveValue("quiz prompt 1");
  expect(requestedTargets).toEqual([
    "presentation",
    "animation",
    "teaching_document",
    "mind_map",
    "quiz",
  ]);
});

test("submits chat messages through the assistant runtime", async ({ page }) => {
  let requestBody: unknown;
  await page.route("**/api/agent/chat", async (route) => {
    requestBody = route.request().postDataJSON();
    const conversationId = (requestBody as { conversationId: string }).conversationId;
    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({
            type: "tool-input-available",
            toolCallId: "search-1",
            toolName: "web_search",
            input: {},
            providerExecuted: true,
          });
          writer.write({
            type: "tool-output-available",
            toolCallId: "search-1",
            output: {
              sources: [{ type: "url", url: "https://example.com/current-source" }],
            },
            providerExecuted: true,
          });
          writer.write({ type: "text-start", id: "answer" });
          writer.write({ type: "text-delta", id: "answer", delta: "这是流式 Agent 回复。" });
          writer.write({ type: "text-end", id: "answer" });
          writer.write({
            type: "data-threadTitle",
            data: { conversationId, title: "资料总结" },
            transient: true,
          });
        },
      }),
    });
    await route.fulfill({
      body: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
      status: response.status,
    });
  });
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });

  const composer = page.getByPlaceholder("输入你的想法或任务");
  await expect(async () => {
    await composer.fill("总结这份资料");
    await expect(composer).toHaveValue("总结这份资料");
  }).toPass();
  await expect(page.getByRole("button", { name: "发送" })).toBeEnabled();
  await composer.press("Enter");

  const userMessage = page.getByText("总结这份资料", { exact: true });
  await expect(userMessage).toBeVisible();
  const userMessageBox = await userMessage.boundingBox();
  if (!userMessageBox) throw new Error("Missing submitted user message");
  expect(userMessageBox.width).toBeGreaterThan(userMessageBox.height);
  await expect(page.getByText("这是流式 Agent 回复。", { exact: true })).toBeVisible();
  const webSourcesSummary = page.getByText("1 个网页来源", { exact: true });
  await expect(webSourcesSummary).toBeVisible();
  await webSourcesSummary.click();
  const webSource = page.getByRole("link", { name: /example\.com/ });
  await expect(webSource).toHaveAttribute("href", "https://example.com/current-source");
  await expect(webSource).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.locator(".workspace-thread-title")).toHaveText("资料总结");
  await expect(composer).toHaveValue("");
  expect(requestBody).toMatchObject({
    messages: expect.arrayContaining([expect.objectContaining({ role: "user" })]),
    surface: { type: "studio" },
    workspaceId: fixture.workspaceId,
  });
  expect(requestBody).not.toHaveProperty("system");
  expect(requestBody).not.toHaveProperty("tools");
});

test("keeps the pending indicator while a refresh resumes exactly one active answer", async ({
  page,
}) => {
  const streamId = "10000000-0000-4000-8000-000000000090";
  let resumeRequests = 0;
  let chatPosts = 0;
  const resumePath = `/api/agent/chat/${fixture.resumeConversationId}/stream`;
  await page.addInitScript(({ key, value }) => window.sessionStorage.setItem(key, value), {
    key: `spectra:chat-stream:${fixture.workspaceId}:${fixture.resumeConversationId}`,
    value: streamId,
  });
  await page.exposeFunction("recordSpectraResumeRequest", () => {
    resumeRequests += 1;
  });
  await page.addInitScript(
    ({ body, headers, path }) => {
      const scope = window as typeof window & {
        recordSpectraResumeRequest: () => Promise<void>;
        releaseSpectraResume?: () => void;
      };
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
          window.location.origin,
        );
        if ((init?.method === undefined || init.method === "GET") && url.pathname === path) {
          await scope.recordSpectraResumeRequest();
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    'data: {"messageId":"resumed-message","type":"start"}\n\n',
                  ),
                );
                scope.releaseSpectraResume = () => {
                  controller.enqueue(new TextEncoder().encode(body));
                  controller.close();
                };
              },
            }),
            { headers, status: 200 },
          );
        }
        return originalFetch(input, init);
      };
    },
    {
      body: [
        'data: {"id":"resumed-answer","type":"text-start"}',
        'data: {"delta":"刷新后恢复的唯一回答。","id":"resumed-answer","type":"text-delta"}',
        'data: {"id":"resumed-answer","type":"text-end"}',
        "data: [DONE]",
        "",
      ].join("\n\n"),
      headers: {
        ...UI_MESSAGE_STREAM_HEADERS,
        "x-resumable-stream-id": streamId,
      },
      path: resumePath,
    },
  );
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/agent/chat" && request.method() === "POST") chatPosts += 1;
  });

  await page.goto(fixture.resumeUrl, { waitUntil: "domcontentloaded" });
  await waitForWorkbenchLayout(page);
  await expect(page.getByText("刷新恢复测试", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => resumeRequests).toBe(1);
  await expect(page.getByText("正在准备回答…", { exact: true })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("刷新恢复测试", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("正在准备回答…", { exact: true })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("刷新恢复测试", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("正在准备回答…", { exact: true })).toBeVisible();
  expect(resumeRequests).toBe(3);

  await page.evaluate(() => {
    const scope = window as typeof window & { releaseSpectraResume?: () => void };
    scope.releaseSpectraResume?.();
  });
  const resumedAnswer = page.getByText("刷新后恢复的唯一回答。", { exact: true });
  await expect(resumedAnswer).toBeVisible();
  await expect(resumedAnswer).toHaveCount(1);
  await expect(page.getByText("正在准备回答…", { exact: true })).toHaveCount(0);
  expect(chatPosts).toBe(0);
});

test("renders a streamed Knowledge citation and opens its exact Evidence with the keyboard", async ({
  page,
}) => {
  const evidenceId = "79cfe9a0-b1f4-51d7-a6fb-43df5273c6ac";
  const citationToken = "ke-0123456789abcdef";
  const excerpt =
    "解决的主要问题是确定待填充的像素，即检查光栅屏幕上的每一像素是否位于多边形区域内。";
  const contextText = `多边形填充需要把连续的几何描述转换为离散像素。\n\n${excerpt}\n\n扫描转换时还需要正确处理边界和顶点。`;
  const highlightStart = contextText.indexOf(excerpt);
  let contextRequests = 0;
  await page.route(`**/knowledge/evidence/${evidenceId}/context`, async (route) => {
    contextRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        evidenceId,
        contextText,
        exactExcerpt: excerpt,
        highlight: { start: highlightStart, end: highlightStart + excerpt.length },
      }),
    });
  });
  await page.route("**/api/agent/chat", async (route) => {
    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({
            type: "data-knowledgeEvidence",
            data: numberedKnowledgeEvidenceData([
              {
                citationNumber: 1,
                citationToken,
                evidenceId,
                sourceId: "00000000-0000-4000-8000-000000000032",
                sourceName: "第3章 基本图形生成算法2-20251010.pdf",
                sourceRevision: 1,
                representationHash: "a".repeat(64),
                exactExcerpt: excerpt,
                locator: { kind: "text_range", start: 116, end: 198 },
                content: { kind: "exact_text", text: excerpt },
                fidelity: "source",
                contentHash: createHash("sha256").update(excerpt).digest("hex"),
              },
            ]),
          });
          writer.write({ type: "text-start", id: "knowledge-answer" });
          writer.write({
            type: "text-delta",
            id: "knowledge-answer",
            delta: "实区域填充算法需要确定待填充的像素。[1]",
          });
          writer.write({ type: "text-end", id: "knowledge-answer" });
        },
      }),
    });
    await route.fulfill({
      body: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
      status: response.status,
    });
  });
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });
  const composer = page.getByPlaceholder("输入你的想法或任务");
  await composer.fill("实区域填充算法解决什么问题？");
  await composer.press("Enter");

  const citation = page.getByRole("button", {
    name: "查看引用 1：第3章 基本图形生成算法2-20251010.pdf",
  });
  await expect(citation).toBeVisible();
  await expect(citation).toHaveClass(/workspace-source-file-icon/);
  await expect(citation).toHaveAttribute("style", /--source-icon-foreground-light:\s*#be123c/);
  await expect(citation).toHaveCSS("background-color", "rgb(255, 228, 230)");
  await citation.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(excerpt);
  await expect(dialog).toContainText("文本位置 116–198");
  await expect(dialog).not.toContainText("修订 1");
  await expect(dialog).toContainText("来源上下文");
  await expect(dialog.locator("mark")).toHaveText(excerpt);
  await expect(dialog).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(dialog).not.toContainText("内容哈希");
  await expect(page.getByText("1 条工作区证据", { exact: true })).toHaveCount(0);
  await expectNoSeriousAccessibilityViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await citation.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCSS("background-color", "rgb(24, 24, 27)");
  expect(contextRequests).toBe(1);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("renders a typed Knowledge image as standalone figure markup", async ({ page }) => {
  const content = {
    accessibleDescription: "凸轮轴拆卸结构图",
    kind: "visual_region" as const,
  };
  const fidelity = "source" as const;
  const locator = {
    boxes: [{ bottom: 1, left: 0, right: 1, top: 0 }],
    kind: "page_region" as const,
    pageIndex: 10,
  };
  const evidence = {
    citationNumber: 1,
    citationToken: "ke-fedcba9876543210",
    content,
    contentHash: knowledgeStructuredContentHash({ content, fidelity, locator }),
    evidenceId: "00000000-0000-4000-8000-000000000091",
    exactExcerpt: "凸轮轴拆卸结构图",
    fidelity,
    locator,
    representationHash: "b".repeat(64),
    sourceId: "00000000-0000-4000-8000-000000000092",
    sourceName: "摩托车发动机维修手册.pdf",
    sourceRevision: 1,
  };
  await page.route("**/api/agent/chat", async (route) => {
    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({
            data: numberedKnowledgeEvidenceData([evidence], [evidence.evidenceId]),
            type: "data-knowledgeEvidence",
          });
          writer.write({ id: "visual-answer", type: "text-start" });
          writer.write({
            delta: `![错误图片占位](typed-image-data)\n\n拆卸前准备。\n\n按图示拆卸座盖。[1](#knowledge-evidence-${evidence.citationToken})\n\n图片后的检查说明。`,
            id: "visual-answer",
            type: "text-delta",
          });
          writer.write({ id: "visual-answer", type: "text-end" });
        },
      }),
    });
    await route.fulfill({
      body: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
      status: response.status,
    });
  });
  await page.route(`**/knowledge/evidence/${evidence.evidenceId}/image`, async (route) => {
    await route.fulfill({
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
      contentType: "image/png",
      status: 200,
    });
  });
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });

  const composer = page.getByPlaceholder("输入你的想法或任务");
  await composer.fill("展示凸轮轴拆卸图");
  await composer.press("Enter");

  const image = page.getByRole("img", { name: "凸轮轴拆卸结构图" });
  await expect(image).toBeVisible();
  await expect(page.getByRole("img", { name: "错误图片占位" })).toHaveCount(0);
  await expect(page.locator('img[src="typed-image-data"]')).toHaveCount(0);
  await expect(image.locator("xpath=ancestor::figure")).toHaveCount(1);
  await expect(page.locator(".aui-md p figure")).toHaveCount(0);
  await expect(page.locator(".aui-md figure figcaption")).toHaveCount(0);
  const contentOrder = await page.locator(".aui-md p, .aui-md figure").evaluateAll((nodes) =>
    nodes.map((node) => ({
      tagName: node.tagName,
      text: node.textContent?.trim(),
    })),
  );
  const citedParagraphIndex = contentOrder.findIndex((item) =>
    item.text?.startsWith("按图示拆卸座盖。"),
  );
  const figureIndex = contentOrder.findIndex((item) => item.tagName === "FIGURE");
  const followingParagraphIndex = contentOrder.findIndex(
    (item) => item.text === "图片后的检查说明。",
  );
  expect(citedParagraphIndex).toBeGreaterThanOrEqual(0);
  expect(figureIndex).toBe(citedParagraphIndex + 1);
  expect(followingParagraphIndex).toBe(figureIndex + 1);
});

test("starts a new conversation from the existing header control", async ({ page }) => {
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });

  await page.locator(".workspace-thread-trigger").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await page.getByRole("menuitem", { name: "新对话" }).click();

  await expect(page).toHaveURL(/\?conversation=[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "今天想从哪里开始？" })).toBeVisible();
  await expect(
    page.getByText("你可以直接提问，也可以先添加资料，再让 Spectra 帮你整理或创作。"),
  ).toBeVisible();
});

test("restores a conversation teaching document from History and its deep link", async ({
  page,
}) => {
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });

  const historyLink = page.getByRole("link", { name: /Persistent teaching document/ });
  await expect(historyLink).toBeVisible();
  await historyLink.click();
  await expect(page).toHaveURL(
    new RegExp(`conversation=${fixture.conversationId}&artifact=${fixture.artifactId}$`),
  );
  await expect(page.getByTestId("teaching-document-workspace")).toBeVisible();
  await expect(
    page
      .getByTestId("teaching-document-workspace")
      .getByRole("heading", { level: 1, name: "Persistent teaching document" }),
  ).toBeVisible();
  await expect(
    page.getByText("This document can be restored from conversation history."),
  ).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId("teaching-document-workspace")).toBeVisible();
  await page.getByRole("button", { name: "返回备课工坊" }).click();
  await expect(page).toHaveURL(new RegExp(`conversation=${fixture.conversationId}$`));
  await expect(page.getByTestId("studio-panel")).toBeVisible();
  await expect(historyLink).toBeVisible();
});

test("keeps a document selection highlighted until a matching proposal takes over", async ({
  page,
}) => {
  let requestBody: {
    surface?: {
      artifactId?: string;
      focus?: { blockIds: string[]; revisionId: string; selectedText: string };
      revisionId?: string;
    };
  } = {};
  let releaseProposal: () => void = () => undefined;
  const proposalGate = new Promise<void>((resolve) => {
    releaseProposal = resolve;
  });
  await page.route("**/api/agent/chat", async (route) => {
    requestBody = route.request().postDataJSON();
    await proposalGate;
    const focus = requestBody.surface?.focus;
    const blockId = focus?.blockIds[0];
    const artifactId = requestBody.surface?.artifactId;
    const revisionId = requestBody.surface?.revisionId;
    if (!blockId || !artifactId || !revisionId) throw new Error("Missing focused request scope");
    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({
            data: {
              artifactId,
              baseRevisionId: revisionId,
              edits: [
                {
                  blockId,
                  operation: "replace_block",
                  replacementMarkdown: "A focused replacement from the proposal.",
                },
              ],
              kind: "teaching_document",
              request: "Rewrite only the selected text",
              runId: "00000000-0000-4000-8000-000000000704",
              summary: "Rewrite the selected paragraph",
              title: "Persistent teaching document",
            },
            type: "data-teachingDocumentEditProposed",
          });
          writer.write({ id: "answer", type: "text-start" });
          writer.write({ delta: "已准备选区修改。", id: "answer", type: "text-delta" });
          writer.write({ id: "answer", type: "text-end" });
        },
      }),
    });
    await route.fulfill({
      body: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
      status: response.status,
    });
  });
  await page.goto(`${fixtureUrl}&artifact=${fixture.artifactId}`, { waitUntil: "networkidle" });

  const paragraph = page
    .getByTestId("teaching-document-workspace")
    .locator(".teaching-document-editor .ProseMirror p")
    .filter({ hasText: "This document can be restored from conversation history." });
  await paragraph.evaluate((element) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(page.getByRole("button", { name: "询问 AI" })).toBeVisible();
  await page.getByRole("button", { name: "询问 AI" }).click();

  const focusMark = page.locator(".teaching-document-assistant-focus");
  await expect(focusMark).toBeVisible();
  await expect(
    page.getByText("已将选区作为当前对话范围；只有明确提出修改时才会生成提案。"),
  ).toBeVisible();
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page
        .locator("[data-workspace-theme]")
        .evaluate((element) =>
          getComputedStyle(element).getPropertyValue("--studio-accent-text").trim(),
        ),
    )
    .toBe("#60a5fa");
  await expect(focusMark).toBeVisible();
  const composer = page.getByPlaceholder("输入你的想法或任务");
  await composer.fill("Rewrite only the selected text");
  await composer.press("Enter");

  await expect
    .poll(() => requestBody.surface?.focus?.selectedText)
    .toBe("This document can be restored from conversation history.");
  expect(requestBody.surface?.focus?.blockIds).toHaveLength(1);
  await expect(focusMark).toBeVisible();
  releaseProposal();

  await expect(page.getByText("修改前")).toBeVisible();
  await expect(page.getByText("修改后")).toBeVisible();
  await expect(page.getByText("A focused replacement from the proposal.")).toBeVisible();
  await expect(focusMark).toHaveCount(0);
});

test("previews and promotes mind-map AI changes without remounting or moving the viewport", async ({
  page,
}) => {
  const acceptedRevisionId = "00000000-0000-4000-8000-000000000705";
  let accepted = false;
  let proposedContent: MindMapRevisionContent | null = null;
  let baseRevisionId = "";

  await page.route("**/api/artifacts/mind-map/**/proposals/**", async (route) => {
    if (!proposedContent || !baseRevisionId) throw new Error("Proposal was not prepared");
    accepted = true;
    const now = new Date().toISOString();
    await route.fulfill({
      json: {
        acceptedRevisionId,
        artifact: {
          createdAt: now,
          currentRevision: {
            artifactId: fixture.mindMapArtifactId,
            content: proposedContent,
            contentSha256: "b".repeat(64),
            createdAt: now,
            id: acceptedRevisionId,
            parentRevisionId: baseRevisionId,
            revisionNumber: 2,
          },
          id: fixture.mindMapArtifactId,
          title: "Persistent mind map",
          updatedAt: now,
          workspaceId: fixture.workspaceId,
        },
      },
    });
  });
  await page.route("**/api/agent/chat", async (route) => {
    const body = route.request().postDataJSON() as {
      surface?: { artifactId?: string; revisionId?: string };
    };
    baseRevisionId = body.surface?.revisionId ?? "";
    if (!baseRevisionId || body.surface?.artifactId !== fixture.mindMapArtifactId) {
      throw new Error("Missing Mind Map request scope");
    }
    const proposalContent = proposedContent;
    const proposalParentId = proposalContent?.nodes[1]?.id;
    if (!proposalContent || !proposalParentId) throw new Error("Missing proposed map content");
    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({
            data: {
              artifactId: fixture.mindMapArtifactId,
              baseRevisionId,
              content: proposalContent,
              edits: [
                {
                  levels: 2,
                  nodes: [
                    {
                      key: "preview-child",
                      label: "AI preview child",
                      note: "",
                      parentKey: null,
                    },
                    {
                      key: "preview-grandchild",
                      label: "AI preview grandchild",
                      note: "",
                      parentKey: "preview-child",
                    },
                  ],
                  parentId: proposalParentId,
                  type: "add_tree",
                },
              ],
              kind: "mind_map",
              request: "Extend this branch by two levels",
              runId: "00000000-0000-4000-8000-000000000706",
              summary: "Add one complete two-level branch",
              title: "Persistent mind map",
            },
            type: "data-mindMapEditProposed",
          });
          writer.write({ id: "answer", type: "text-start" });
          writer.write({ delta: "已准备导图修改。", id: "answer", type: "text-delta" });
          writer.write({ id: "answer", type: "text-end" });
        },
      }),
    });
    await route.fulfill({
      body: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
      status: response.status,
    });
  });

  await page.goto(`${fixtureUrl}&artifact=${fixture.mindMapArtifactId}`, {
    waitUntil: "domcontentloaded",
  });
  const workspace = page.getByTestId("mind-map-workspace");
  const flowNodes = workspace.locator(".react-flow__node");
  await expect(workspace).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => flowNodes.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  const visibleNodes = await flowNodes.evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute("data-id") ?? "",
      label: node.textContent?.replace("−", "").trim() ?? "",
    })),
  );
  const root = visibleNodes.find((node) => node.label.includes("Persistent mind map"));
  const children = visibleNodes.filter((node) => node.id && node.id !== root?.id);
  if (!root?.id || children.length < 2) throw new Error("Missing Mind Map fixture nodes");
  proposedContent = mindMapRevisionContentSchema.parse({
    generation: {
      outcome: "complete",
      rawOutput: "Add one complete two-level branch",
      warnings: [],
    },
    nodes: [
      { id: root.id, label: "Persistent mind map", order: 0, parentId: null },
      ...children.map((node, order) => ({
        id: node.id,
        label: node.label,
        order,
        parentId: root.id,
      })),
      {
        id: "00000000-0000-4000-8000-000000000707",
        label: "AI preview child",
        order: 0,
        parentId: children[0]?.id ?? null,
      },
      {
        id: "00000000-0000-4000-8000-000000000708",
        label: "AI preview grandchild",
        order: 0,
        parentId: "00000000-0000-4000-8000-000000000707",
      },
    ],
    rootId: root.id,
    schemaVersion: 2,
  });
  const rootNode = flowNodes.filter({ hasText: "Persistent mind map" }).first();
  await rootNode.evaluate((element) => element.setAttribute("data-promotion-anchor", "stable"));
  const viewport = workspace.locator(".react-flow__viewport");
  await viewport.evaluate(async (element) => {
    let last = getComputedStyle(element).transform;
    let stableFrames = 0;
    while (stableFrames < 5) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const current = getComputedStyle(element).transform;
      stableFrames = current === last ? stableFrames + 1 : 0;
      last = current;
    }
  });
  const viewportBefore = await viewport.evaluate((element) => getComputedStyle(element).transform);

  const composer = page.getByPlaceholder("输入你的想法或任务");
  await composer.fill("Extend this branch by two levels");
  await composer.press("Enter");

  await expect(workspace.getByText("预览 2 项 AI 更改")).toBeVisible();
  await expect(workspace.getByText("AI preview child", { exact: true })).toBeVisible();
  await expect(workspace.getByText("AI preview grandchild", { exact: true })).toBeVisible();
  await expect(workspace.getByText("＋新增")).toHaveCount(2);
  await expect(rootNode).toHaveAttribute("data-promotion-anchor", "stable");
  expect(await viewport.evaluate((element) => getComputedStyle(element).transform)).toBe(
    viewportBefore,
  );

  await workspace.getByRole("button", { name: "应用更改" }).click();
  await expect.poll(() => accepted).toBe(true);
  await expect(workspace.getByText("预览 2 项 AI 更改")).toHaveCount(0);
  await expect(workspace.getByText("＋新增")).toHaveCount(0);
  await expect(workspace.getByText("AI preview child", { exact: true })).toBeVisible();
  await expect(workspace.getByText("AI preview grandchild", { exact: true })).toBeVisible();
  await expect(rootNode).toHaveAttribute("data-promotion-anchor", "stable");
  expect(await viewport.evaluate((element) => getComputedStyle(element).transform)).toBe(
    viewportBefore,
  );
});

test("restores and edits a mind map through History", async ({ page }) => {
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });

  await page.getByRole("link", { name: /Persistent mind map/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`conversation=${fixture.conversationId}&artifact=${fixture.mindMapArtifactId}$`),
  );
  const workspace = page.getByTestId("mind-map-workspace");
  await expect(workspace).toBeVisible();
  await expect(workspace.getByText("Left branch", { exact: true })).toBeVisible();
  await expect(workspace.getByText("Right branch", { exact: true })).toBeVisible();
  await expect(workspace.getByRole("button", { name: "导图" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await workspace.getByRole("button", { name: "大纲" }).click();
  const outline = workspace.getByTestId("mind-map-outline");
  await expect(outline).toBeVisible();
  await outline.getByRole("searchbox").fill("note restored");
  await outline.getByRole("button", { name: /Left branch/ }).click();
  await expect(workspace.getByTestId("mind-map-canvas")).toBeVisible();
  await expect(workspace.getByTestId("mind-map-node-inspector")).toContainText("Left branch");

  await workspace
    .getByTestId("mind-map-node-inspector")
    .getByRole("button", { name: "只看此分支" })
    .click();
  await expect(workspace.getByRole("button", { name: "返回完整导图" })).toBeVisible();
  await workspace.getByRole("button", { name: "返回完整导图" }).click();

  await workspace.getByRole("button", { name: "编辑" }).click();
  await workspace.locator(".react-flow__node").getByText("Left branch", { exact: true }).click();
  await workspace.getByRole("button", { name: "添加子节点" }).click();
  const addDialog = page.getByRole("dialog", { name: "新增子节点" });
  await addDialog.getByLabel("短标题").fill("Temporary child");
  await addDialog.getByLabel("备注").fill("Created through the canvas toolbar.");
  await addDialog.getByRole("button", { name: "确认新增" }).click();
  await expect(
    workspace.locator(".react-flow__node").getByText("Temporary child", { exact: true }),
  ).toBeVisible();
  await workspace.getByRole("button", { name: "删除分支" }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "确认删除当前节点？" });
  await expect(deleteDialog).toContainText("Temporary child");
  await deleteDialog.getByRole("button", { name: "确认删除" }).click();
  await expect(
    workspace.locator(".react-flow__node").getByText("Temporary child", { exact: true }),
  ).toHaveCount(0);

  await workspace.locator(".react-flow__node").getByText("Left branch", { exact: true }).click();
  await workspace.getByRole("button", { name: "重命名" }).click();
  const editDialog = page.getByRole("dialog", { name: "编辑当前节点" });
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByLabel("备注")).toHaveValue(
    "A note restored from the canonical revision.",
  );
  const applyEdit = editDialog.getByRole("button", { name: "保存修改" });
  await expect(applyEdit).toBeDisabled();
  await expect(editDialog).toHaveAttribute("data-studio-tone", "teal");
  await expect(applyEdit).toHaveClass(/bg-\[var\(--studio-emphasis\)\]/);
  await editDialog.getByLabel("短标题").fill("Edited branch");
  await expect(applyEdit).toBeEnabled();
  await applyEdit.click();
  await expect(editDialog).toBeHidden();
  await expect(
    workspace.locator(".react-flow__node").getByText("Edited branch", { exact: true }),
  ).toBeVisible();
  await workspace.getByRole("button", { name: "保存" }).click();
  await expect(workspace.getByRole("button", { name: "编辑" })).toBeVisible({ timeout: 15_000 });
  await expect(
    workspace.locator(".react-flow__node").getByText("Edited branch", { exact: true }),
  ).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByTestId("mind-map-workspace").locator(".react-flow__node").getByText("Edited branch"),
  ).toBeVisible();
});

test("shows only complete Source cards in document compose and preview modes", async ({ page }) => {
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });

  await page
    .getByTestId("studio-panel")
    .getByRole("button", { name: /Teaching document|教学文档/ })
    .click();
  await expect(page.getByTestId("teaching-document-workspace")).toBeVisible();
  await expectWholeSourceRows(page, 4);

  await page.getByRole("button", { name: "返回备课工坊" }).click();
  await page.getByRole("link", { name: /Persistent teaching document/ }).click();
  await expect(page.getByTestId("teaching-document-workspace")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Persistent teaching document",
      exact: true,
    }),
  ).toBeVisible();
  await expectWholeSourceRows(page, 2);
});

test("uploads and deletes an audio Source through the real browser flow", async ({ page }) => {
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });
  const sources = page.getByTestId("source-drop-target");
  await sources.evaluate((element) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["preview"], "drag-preview.pdf", { type: "application/pdf" }));
    element.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer }));
  });
  await expect(page.getByText("松开即可上传", { exact: true })).toBeVisible();
  await sources.evaluate((element) => {
    const dataTransfer = new DataTransfer();
    const bytes = new Uint8Array(1024);
    bytes.set(new TextEncoder().encode("RIFFxxxxWAVEfmt "));
    dataTransfer.items.add(
      new File([bytes], "browser-contract.wav", {
        type: "audio/wav",
      }),
    );
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });

  await expect(page.getByText("browser-contract.wav", { exact: true })).toBeVisible();
  await expect(sources.locator(".lucide-audio-lines")).toBeVisible();
  await expect(page.getByText("等待音频分析", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectNoSeriousAccessibilityViolations(page);

  await page.getByRole("button", { name: "删除 browser-contract.wav" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "删除" }).click();
  await expect(page.getByText("browser-contract.wav", { exact: true })).toHaveCount(0);
});

test("uploads and deletes an MP4 Source through the real browser flow", async ({ page }) => {
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });
  const sources = page.getByTestId("source-drop-target");
  await sources.evaluate((element) => {
    const dataTransfer = new DataTransfer();
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02,
      0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    ]);
    dataTransfer.items.add(
      new File([bytes], "browser-contract.mp4", {
        type: "video/mp4",
      }),
    );
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });

  await expect(page.getByText("browser-contract.mp4", { exact: true })).toBeVisible();
  await expect(sources.locator(".lucide-clapperboard")).toBeVisible();
  await expect(page.getByText("等待视频分析", { exact: true })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);

  await page.getByRole("button", { name: "删除 browser-contract.mp4" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "删除" }).click();
  await expect(page.getByText("browser-contract.mp4", { exact: true })).toHaveCount(0);
});

test("shows the expanded Source format families", async ({ page }) => {
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });
  const sources = page.getByTestId("source-drop-target");
  await sources.evaluate((element) => {
    const dataTransfer = new DataTransfer();
    const workbook = new Uint8Array(1024);
    workbook.set([0x50, 0x4b, 0x03, 0x04]);
    const movie = new Uint8Array([
      0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20, 0x00, 0x00, 0x00,
      0x00, 0x71, 0x74, 0x20, 0x20,
    ]);
    dataTransfer.items.add(
      new File([workbook], "browser-contract.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    dataTransfer.items.add(
      new File(["# 课堂说明\n正文"], "browser-contract.md", { type: "text/markdown" }),
    );
    dataTransfer.items.add(
      new File(["name,score\n张三,95"], "browser-contract.csv", { type: "text/csv" }),
    );
    dataTransfer.items.add(
      new File(['{"title":"课程"}'], "browser-contract.json", { type: "application/json" }),
    );
    dataTransfer.items.add(
      new File(["print('课程')"], "browser-contract.py", { type: "text/x-python" }),
    );
    dataTransfer.items.add(
      new File(["WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n课程"], "browser-contract.vtt", {
        type: "text/vtt",
      }),
    );
    dataTransfer.items.add(
      new File(
        ['{"nbformat":4,"metadata":{},"cells":[{"cell_type":"code","source":"1 + 1"}]}'],
        "browser-contract.ipynb",
        { type: "application/x-ipynb+json" },
      ),
    );
    dataTransfer.items.add(new File([movie], "browser-contract.mov", { type: "video/quicktime" }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });

  for (const filename of [
    "browser-contract.xlsx",
    "browser-contract.md",
    "browser-contract.csv",
    "browser-contract.json",
    "browser-contract.py",
    "browser-contract.vtt",
    "browser-contract.ipynb",
    "browser-contract.mov",
  ]) {
    await expect(page.getByText(filename, { exact: true })).toBeVisible();
  }
  for (const [filename, iconClass] of [
    ["browser-contract.xlsx", ".lucide-file-spreadsheet"],
    ["browser-contract.md", ".lucide-file-type-corner"],
    ["browser-contract.csv", ".lucide-table-2"],
    ["browser-contract.json", ".lucide-braces"],
    ["browser-contract.py", ".lucide-file-code-corner"],
    ["browser-contract.vtt", ".lucide-captions"],
    ["browser-contract.ipynb", ".lucide-notebook-tabs"],
    ["browser-contract.mov", ".lucide-clapperboard"],
  ] as const) {
    await expect(
      sources
        .locator(".workspace-sources-rail-item")
        .filter({ hasText: filename })
        .locator(iconClass),
    ).toBeVisible();
  }
  await expectNoSeriousAccessibilityViolations(page);

  for (const filename of [
    "browser-contract.xlsx",
    "browser-contract.md",
    "browser-contract.csv",
    "browser-contract.json",
    "browser-contract.py",
    "browser-contract.vtt",
    "browser-contract.ipynb",
    "browser-contract.mov",
  ]) {
    await page.getByRole("button", { name: `删除 ${filename}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "删除" }).click();
    await expect(page.getByText(filename, { exact: true })).toHaveCount(0);
  }
});

test("preserves both vertical panel resizers", async ({ page }) => {
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });
  const studio = page.locator("[data-testid='studio-panel']");
  const sources = page.locator("[data-testid='sources-panel']");
  const initialStudioWidth = (await studio.boundingBox())?.width ?? 0;
  const initialSourcesWidth = (await sources.boundingBox())?.width ?? 0;
  const initialSourcesX = (await sources.boundingBox())?.x ?? 0;

  const leftHandle = page.locator("[data-testid='studio-chat-resizer']");
  const leftBox = await leftHandle.boundingBox();
  if (!leftBox) throw new Error("Missing studio/chat resizer");
  await page.mouse.move(leftBox.x + leftBox.width / 2, leftBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(leftBox.x + 40, leftBox.y + 100);
  await page.mouse.up();
  expect((await studio.boundingBox())?.width ?? 0).toBeGreaterThan(initialStudioWidth);
  expect(
    Math.abs(((await sources.boundingBox())?.width ?? 0) - initialSourcesWidth),
  ).toBeLessThanOrEqual(1);

  const widthAfterRelease = (await studio.boundingBox())?.width ?? 0;
  await page.mouse.move(leftBox.x + 100, leftBox.y + 100);
  expect(
    Math.abs(((await studio.boundingBox())?.width ?? 0) - widthAfterRelease),
  ).toBeLessThanOrEqual(1);

  const rightHandle = page.locator("[data-testid='chat-sources-resizer']");
  const rightBox = await rightHandle.boundingBox();
  if (!rightBox) throw new Error("Missing chat/sources resizer");
  await page.mouse.move(rightBox.x + rightBox.width / 2, rightBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(rightBox.x - 30, rightBox.y + 100);
  await page.mouse.up();
  expect((await sources.boundingBox())?.x ?? 0).toBeLessThan(initialSourcesX);
});

test("keeps the Assistant header fixed when message scrolling reaches the end", async ({
  page,
}) => {
  await page.route("**/api/agent/chat", async (route) => {
    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({ type: "text-start", id: "long-answer" });
          writer.write({
            type: "text-delta",
            id: "long-answer",
            delta: Array.from({ length: 24 }, (_, index) => `滚动测试第 ${index + 1} 段`).join(
              "\n\n",
            ),
          });
          writer.write({ type: "text-end", id: "long-answer" });
        },
      }),
    });
    await route.fulfill({
      body: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
      status: response.status,
    });
  });
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });

  const chatPanel = page.getByTestId("chat-panel");
  const messageViewport = chatPanel.locator(".workspace-chat-viewport");
  const composer = chatPanel.locator(".workspace-chat-input-shell");
  const disclaimer = page.getByTestId("workbench-disclaimer");
  const assistantHeading = chatPanel.getByRole("heading", { name: "智能助手" });
  const scrollToBottom = chatPanel.getByRole("button", { name: "回到最新消息" });

  const composerInput = page.getByPlaceholder("输入你的想法或任务");
  await composerInput.fill("生成滚动测试内容");
  await composerInput.press("Enter");
  await expect(page.getByText("滚动测试第 24 段", { exact: true })).toBeVisible();

  const headingTop = (await assistantHeading.boundingBox())?.y;
  const composerTop = (await composer.boundingBox())?.y;
  const disclaimerTop = (await disclaimer.boundingBox())?.y;
  expect(headingTop).toBeDefined();
  expect(composerTop).toBeDefined();
  expect(disclaimerTop).toBeDefined();
  expect(
    await chatPanel.evaluate((panel) => {
      const viewport = panel.querySelector(".workspace-chat-viewport");
      const composerElement = panel.querySelector(".workspace-chat-input-shell");
      return Boolean(viewport && composerElement && viewport.contains(composerElement));
    }),
  ).toBe(false);

  await expect
    .poll(() => messageViewport.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(0);
  await messageViewport.evaluate((element) => element.scrollTo(0, 0));
  await expect(scrollToBottom).toBeEnabled();
  await scrollToBottom.click();
  await expect
    .poll(() =>
      messageViewport.evaluate(
        (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeLessThanOrEqual(2);

  await messageViewport.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await messageViewport.hover();
  await page.mouse.wheel(0, 800);

  expect(await chatPanel.evaluate((element) => element.parentElement?.scrollTop)).toBe(0);
  expect((await assistantHeading.boundingBox())?.y).toBe(headingTop);
  expect((await composer.boundingBox())?.y).toBe(composerTop);
  expect((await disclaimer.boundingBox())?.y).toBe(disclaimerTop);
  await expect(disclaimer).toHaveText("Spectra 输出内容可能存在偏差，请在使用前进行复核。");
  await expect(
    chatPanel.getByText("Spectra 输出内容可能存在偏差，请在使用前进行复核。"),
  ).toHaveCount(0);

  await composerInput.fill(
    Array.from({ length: 20 }, (_, index) => `草稿第 ${index + 1} 行`).join("\n"),
  );
  const composerScroll = chatPanel.locator(".workspace-chat-composer-scroll");
  await expect(composerScroll).toHaveCSS("overscroll-behavior-y", "contain");
  await expect
    .poll(() => composerScroll.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(0);
  await messageViewport.evaluate((element) => element.scrollTo(0, 0));
  await composerScroll.evaluate((element) => element.scrollTo(0, 0));
  await waitForStableScroll(messageViewport);
  await composerInput.hover();
  const messageScrollTopBeforeComposerScroll = await messageViewport.evaluate(
    (element) => element.scrollTop,
  );
  await page.mouse.wheel(0, 120);
  await expect
    .poll(() => composerScroll.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await waitForStableScroll(messageViewport);
  expect(await messageViewport.evaluate((element) => element.scrollTop)).toBe(
    messageScrollTopBeforeComposerScroll,
  );

  const composerMaxScroll = await composerScroll.evaluate(
    (element) => element.scrollHeight - element.clientHeight,
  );
  await composerScroll.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  const messageScrollTopAtComposerBoundary = await messageViewport.evaluate(
    (element) => element.scrollTop,
  );
  await page.mouse.wheel(0, 800);
  await expect
    .poll(() => composerScroll.evaluate((element) => element.scrollTop))
    .toBe(composerMaxScroll);
  await waitForStableScroll(messageViewport);
  await expect
    .poll(() => messageViewport.evaluate((element) => element.scrollTop))
    .toBe(messageScrollTopAtComposerBoundary);
});

test("keeps every Studio tool card visible at the minimum panel width", async ({ page }) => {
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });

  const studio = page.locator("[data-testid='studio-panel']");
  const leftHandle = page.locator("[data-testid='studio-chat-resizer']");
  const leftBox = await leftHandle.boundingBox();
  if (!leftBox) throw new Error("Missing studio/chat resizer");

  await page.mouse.move(leftBox.x + leftBox.width / 2, leftBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(leftBox.x - 40, leftBox.y + 100);
  await page.mouse.up();

  const studioBox = await studio.boundingBox();
  if (!studioBox) throw new Error("Missing Studio panel");
  expect(studioBox.width).toBeGreaterThanOrEqual(260);

  const toolBoxes = await studio.getByRole("button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top };
    }),
  );

  for (const toolBox of toolBoxes) {
    expect(toolBox.left).toBeGreaterThanOrEqual(studioBox.x);
    expect(toolBox.right).toBeLessThanOrEqual(studioBox.x + studioBox.width);
  }
  expect(toolBoxes.length).toBeGreaterThanOrEqual(8);
});

test("exposes keyboard-accessible panel separators", async ({ page }) => {
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });

  const separators = page.getByRole("separator");
  await expect(separators).toHaveCount(2);
  await expect(separators.nth(0)).toHaveAttribute("aria-orientation", "vertical");
  await expect(separators.nth(1)).toHaveAttribute("aria-orientation", "vertical");

  const studio = page.locator("[data-testid='studio-panel']");
  const initialStudioWidth = (await studio.boundingBox())?.width ?? 0;

  await separators.nth(0).focus();
  await page.keyboard.press("ArrowRight");

  expect((await studio.boundingBox())?.width ?? 0).toBeGreaterThan(initialStudioWidth);
});

test("collapses and restores the sources panel", async ({ page }) => {
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });
  await waitForWorkbenchLayout(page);

  const sources = page.locator("[data-testid='sources-panel']");
  const rightHandle = page.locator("[data-testid='chat-sources-resizer']");
  const rightBox = await rightHandle.boundingBox();
  if (!rightBox) throw new Error("Missing chat/sources separator");
  await page.mouse.move(rightBox.x + rightBox.width / 2, rightBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(rightBox.x + 260, rightBox.y + 100);
  await page.mouse.up();
  await expect
    .poll(async () => (await sources.boundingBox())?.width ?? 0, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(55);
  await expect
    .poll(async () => (await sources.boundingBox())?.width ?? 0, { timeout: 15_000 })
    .toBeLessThanOrEqual(57);

  await page.getByRole("button", { name: "展开资料来源" }).click();
  expect((await sources.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(214);
});

test("renders a compact icon rail when the sources panel is collapsed", async ({ page }) => {
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });

  const sources = page.locator("[data-testid='sources-panel']");
  const rightHandle = page.locator("[data-testid='chat-sources-resizer']");
  const rightBox = await rightHandle.boundingBox();
  if (!rightBox) throw new Error("Missing chat/sources separator");
  await page.mouse.move(rightBox.x + rightBox.width / 2, rightBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(rightBox.x + 260, rightBox.y + 100);
  await page.mouse.up();

  expect(Math.abs(((await sources.boundingBox())?.width ?? 0) - 56)).toBeLessThanOrEqual(1);
  await expect(sources.getByText("资料来源", { exact: true })).toBeHidden();
  await expect(sources.getByText("导入", { exact: true })).toBeHidden();
  const importButton = sources.getByRole("button", { name: "导入" });
  await expect(importButton).toBeVisible();
  expect((await importButton.boundingBox())?.width).toBe(40);
  await expect(importButton.locator(".workspace-sources-import-chevron")).toBeHidden();
});

test("keeps panels usable at 1280 by 800", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixtureUrl, { waitUntil: "networkidle" });

  async function getPanelBox(testId: string) {
    const box = await page.locator(`[data-testid='${testId}']`).boundingBox();
    if (!box) throw new Error(`Missing ${testId}`);
    return box;
  }

  const [studioBox, chatBox, sourcesBox] = await Promise.all([
    getPanelBox("studio-panel"),
    getPanelBox("chat-panel"),
    getPanelBox("sources-panel"),
  ]);

  expect(studioBox.x).toBeGreaterThanOrEqual(24);
  expect(studioBox.x + studioBox.width).toBeLessThanOrEqual(chatBox.x);
  expect(chatBox.x + chatBox.width).toBeLessThanOrEqual(sourcesBox.x);
  expect(sourcesBox.x + sourcesBox.width).toBeLessThanOrEqual(1256);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("keeps the route and local draft when language changes", async ({ page }) => {
  await page.goto(fixtureUrl);
  const originalUrl = page.url();
  const composer = page.getByPlaceholder("输入你的想法或任务");
  await composer.fill("保留这段草稿");

  await page.getByLabel("打开账户菜单").click();
  await page.getByRole("menuitem", { name: "设置" }).click();
  await page.getByText("English", { exact: true }).click();

  await expect(page).toHaveURL(originalUrl);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(page.getByPlaceholder("Describe an idea or task")).toHaveValue("保留这段草稿");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(page.getByPlaceholder("Describe an idea or task")).toHaveValue("");
});

test("follows the system theme and persists an explicit choice", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(fixtureUrl);

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("打开账户菜单").click();
  await page.getByRole("menuitem", { name: "设置" }).click();
  await page.getByText("浅色", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByLabel("打开账户菜单").click();
  await page.getByRole("menuitem", { name: "设置" }).click();
  await page.getByText("深色", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(async () => {
      const response = await page.request.get(fixtureUrl);
      return (await response.text()).match(/<html[^>]+data-theme="([^"]+)"/)?.[1];
    })
    .toBe("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByLabel("打开账户菜单").click();
  await page.getByRole("menuitem", { name: "设置" }).click();
  await page.getByText("跟随系统", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(runtimeErrors).toEqual([]);
});

test("keeps authenticated pages within the accessibility baseline", async ({ page }) => {
  await page.goto("/workspaces");
  await expectNoSeriousAccessibilityViolations(page);

  await page.goto("/workspaces/new");
  await expectNoSeriousAccessibilityViolations(page);

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(fixtureUrl);
  await waitForWorkbenchLayout(page);
  await expectNoSeriousAccessibilityViolations(page);
  const composer = page.getByPlaceholder("输入你的想法或任务");
  await composer.focus();
  await expect(page.locator(".workspace-chat-input-shell")).not.toHaveCSS("box-shadow", "none");
});

test("supports keyboard navigation through page and account preferences", async ({ page }) => {
  await page.goto("/workspaces");

  const skipLink = page.getByRole("link", { name: "跳至主要内容" });
  await tabUntilFocused(page, skipLink);
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const accountMenu = page.getByLabel("打开账户菜单");
  await page.keyboard.press("Shift+Tab");
  await expect(accountMenu).toBeFocused();
  await page.keyboard.press("Enter");
  const settingsItem = page.getByRole("menuitem", { name: "设置" });
  await expect(settingsItem).toBeFocused();
  await page.keyboard.press("Enter");

  const chinese = page.locator('input[name="locale"][value="zh-CN"]');
  await tabUntilFocused(page, chinese);
  await expect(chinese).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");

  const systemTheme = page.locator('input[name="theme"][value="system"]');
  await tabUntilFocused(page, systemTheme);
  await expect(systemTheme).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const lightTheme = page.locator('input[name="theme"][value="light"]');
  await expect(lightTheme).toBeChecked();
});

test("signs out from the Workbench account menu", async ({ browser }) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });

  try {
    const page = await context.newPage();
    await page.goto("/auth/login");
    await page.getByLabel("邮箱").fill("spectra-e2e@example.com");
    await page.getByLabel("密码").fill("Spectra2026E2E!!");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page).toHaveURL(/\/workspaces$/);

    await page.goto(fixtureUrl);
    await page.getByLabel("打开账户菜单").click();
    await page.getByRole("menuitem", { name: "退出登录" }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);
  } finally {
    await context.close();
  }
});
