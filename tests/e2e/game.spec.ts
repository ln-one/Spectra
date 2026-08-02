import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { e2eWorkspacePath } from "./environment";
import { gotoWithRetry } from "./workbench-readiness";

let gameUrl: string;

test.beforeAll(async () => {
  const fixture = JSON.parse(await readFile(e2eWorkspacePath, "utf8")) as {
    gameUrl: string;
  };
  gameUrl = fixture.gameUrl;
});

test("plays through revival, failure, review, and persisted best", async ({ page }) => {
  test.setTimeout(120_000);
  const runtimeErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await gotoWithRetry(page, gameUrl, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "飞跃复活验收游戏" }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("题库", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "开始游戏" }).click({ timeout: 15_000 });
  const canvas = page.getByLabel("飞跃复活游戏舞台");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await canvas.click();
  await expect(page.getByRole("heading", { name: "飞行结束" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "知识复活" }).click();

  for (let index = 0; index < 3; index += 1) {
    await page.getByText(/正确选项/).click();
    if (index < 2) await page.getByRole("button", { name: "下一题" }).click();
  }
  await page.getByRole("button", { name: "统一提交" }).click();
  await expect(page.getByText(/复活成功/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "飞行结束" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "知识复活" }).click();

  for (let index = 0; index < 3; index += 1) {
    await page.getByText(/干扰选项/).click();
    if (index < 2) await page.getByRole("button", { name: "下一题" }).click();
  }
  await page.getByRole("button", { name: "统一提交" }).click();
  await expect(page.getByText("本局分数")).toBeVisible();
  await expect(page.getByTestId("game-result-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "再来一局" })).toBeVisible();
  await page.getByText(/第 1 轮复活/).click();
  await expect(page.getByText("你的答案：").first()).toBeVisible();
  await expect(page.getByText("正确答案：").first()).toBeVisible();
  const lastQuestionInRound = page.getByText("第 3 题", { exact: true }).first();
  await lastQuestionInRound.scrollIntoViewIfNeeded();
  await expect(lastQuestionInRound).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "开始游戏" })).toBeVisible({ timeout: 15_000 });
  expect(runtimeErrors).toEqual([]);
});

test("abandons an active run when the page is refreshed", async ({ page }) => {
  test.setTimeout(90_000);
  await gotoWithRetry(page, gameUrl, { timeout: 30_000 });
  const started = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/artifacts\/game\/[^/]+\/runs\?/.test(response.url()),
  );
  await page.getByRole("button", { name: "开始游戏" }).click({ timeout: 15_000 });
  const startBody = (await (await started).json()) as { run: { id: string } };
  const parsedUrl = new URL(gameUrl, "http://localhost");
  const artifactId = parsedUrl.searchParams.get("artifact");
  const workspaceId = parsedUrl.pathname.split("/").at(-1);
  expect(artifactId).toBeTruthy();
  expect(workspaceId).toBeTruthy();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "开始游戏" })).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => {
      const response = await page.request.get(
        `/api/artifacts/game/${artifactId}/runs/${startBody.run.id}?workspaceId=${workspaceId}`,
      );
      return ((await response.json()) as { run: { state: string } }).run.state;
    })
    .toBe("abandoned");
});
