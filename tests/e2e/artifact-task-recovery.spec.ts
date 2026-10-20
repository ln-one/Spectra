import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { Pool } from "pg";
import { e2eDatabaseUrl, e2eWorkspacePath } from "./environment";
import { gotoWithRetry } from "./workbench-readiness";

test.setTimeout(180_000);

for (const viewport of [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
]) {
  test(`restores a persisted task after leaving at ${viewport.width}px`, async ({
    context,
    page,
  }) => {
    const fixture = JSON.parse(await readFile(e2eWorkspacePath, "utf8")) as {
      resumeUrl: string;
      workspaceId: string;
    };
    const pool = new Pool({ connectionString: e2eDatabaseUrl });
    const conversationId = randomUUID();
    const artifactId = randomUUID();
    const messageId = `user:phase2-${randomUUID()}`;
    const title = `任务恢复 ${artifactId.slice(0, 8)}`;
    try {
      const owner = await pool.query<{ owner_id: string }>(
        "SELECT owner_id FROM workspaces WHERE id = $1",
        [fixture.workspaceId],
      );
      const principalId = owner.rows[0]?.owner_id;
      if (!principalId) throw new Error("Missing test workspace owner");
      await pool.query(
        "INSERT INTO ai_conversations (workspace_id, created_by_principal_id, conversation_id, title) VALUES ($1, $2, $3, $4)",
        [fixture.workspaceId, principalId, conversationId, "任务恢复测试"],
      );
      await pool.query(
        "INSERT INTO ai_messages (id, workspace_id, conversation_id, position, content) VALUES ($1, $2, $3, 0, $4)",
        [
          messageId,
          fixture.workspaceId,
          conversationId,
          { role: "user", parts: [{ type: "text", text: "生成思维导图" }] },
        ],
      );
      await pool.query(
        "INSERT INTO artifacts (id, workspace_id, conversation_id, created_by_principal_id, kind, title, generation_state, source_user_message_id) VALUES ($1, $2, $3, $4, 'mind_map', $5, 'queued', $6)",
        [artifactId, fixture.workspaceId, conversationId, principalId, title, messageId],
      );
      const url = `/workspaces/${fixture.workspaceId}?conversation=${conversationId}`;
      await page.setViewportSize(viewport);
      await gotoWithRetry(page, url, { timeout: 90_000 });
      await expect(page.getByText(title, { exact: true })).toHaveCount(1);
      await expect(page.getByText("等待处理", { exact: true })).toBeVisible();
      await page.close();

      // Simulate a persisted worker result independently of the browser lifecycle.
      await pool.query(
        "UPDATE artifacts SET generation_state = 'failed', generation_failure_code = 'mind_map_generation_timeout', updated_at = now() WHERE id = $1",
        [artifactId],
      );
      const returned = await context.newPage();
      await returned.setViewportSize(viewport);
      await gotoWithRetry(returned, url, { timeout: 90_000 });
      await expect(returned.getByText(title, { exact: true })).toHaveCount(1);
      await expect(returned.getByText("生成失败", { exact: true })).toBeVisible();
      await expect(returned.getByRole("button", { name: /重试生成/ })).toHaveCount(0);
      await expect(returned.getByRole("link", { name: `打开“${title}”` })).toHaveAttribute(
        "href",
        new RegExp(artifactId),
      );
      await gotoWithRetry(returned, fixture.resumeUrl, { timeout: 90_000 });
      await gotoWithRetry(returned, url, { timeout: 90_000 });
      await expect(returned.getByRole("link", { name: `打开“${title}”` })).toHaveCount(1);
      expect(
        await returned.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await returned.close();
    } finally {
      await pool.end();
    }
  });
}

test("shows a submitted task changing state in the mobile message stream", async ({ page }) => {
  const fixture = JSON.parse(await readFile(e2eWorkspacePath, "utf8")) as {
    url: string;
    workspaceId: string;
  };
  const artifactId = randomUUID();
  const createdAt = new Date().toISOString();
  let state: "queued" | "generating" | "ready" = "queued";
  let active = false;
  let updatedAt = createdAt;
  await page.route("**/api/artifacts?**", async (route) => {
    await route.fulfill({
      json: {
        artifacts: active
          ? [
              {
                canRetryGeneration: false,
                createdAt,
                currentRevisionId: state === "ready" ? randomUUID() : null,
                failureCode: null,
                generationState: state,
                id: artifactId,
                kind: "mind_map",
                sourceUserMessageId: null,
                title: "移动任务测试",
                updatedAt,
              },
            ]
          : [],
      },
    });
  });
  await page.route(`**/api/artifacts/${artifactId}?**`, async (route) => {
    await route.fulfill({
      json: {
        detail: {
          artifact: null,
          createdAt,
          draft: null,
          failureCode: null,
          generationAttemptId: null,
          generationSequence: 0,
          generationState: state,
          id: artifactId,
          kind: "mind_map",
          title: "移动任务测试",
          updatedAt,
          workspaceId: fixture.workspaceId,
        },
      },
    });
  });
  await page.route("**/api/agent/chat", async (route) => {
    active = true;
    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({
            type: "data-artifactStarted",
            data: {
              artifact: null,
              createdAt,
              draft: null,
              failureCode: null,
              generationAttemptId: null,
              generationSequence: 0,
              generationState: "queued",
              id: artifactId,
              kind: "mind_map",
              title: "移动任务测试",
              updatedAt,
              workspaceId: fixture.workspaceId,
            },
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
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoWithRetry(page, fixture.url, { timeout: 90_000 });
  const composer = page.getByPlaceholder("输入你的想法或任务");
  await expect(composer).toBeEnabled();
  await expect(async () => {
    await composer.fill("生成一张知识图");
    await expect(composer).toHaveValue("生成一张知识图");
  }).toPass();
  await expect(page.getByRole("button", { name: "发送" })).toBeEnabled();
  await composer.press("Enter");
  await expect(page.getByText("移动任务测试", { exact: true })).toHaveCount(1);
  await expect(page.getByText("等待处理", { exact: true })).toBeVisible();
  state = "generating";
  updatedAt = new Date(Date.now() + 1000).toISOString();
  await expect(page.getByText("生成中", { exact: true })).toBeVisible({ timeout: 15_000 });
  state = "ready";
  updatedAt = new Date(Date.now() + 2000).toISOString();
  await expect(page.getByText("思维导图已生成", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: "打开“移动任务测试”" })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
