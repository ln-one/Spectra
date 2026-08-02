import { expect, test } from "@playwright/test";
import { expectNoSeriousAccessibilityViolations } from "./accessibility";

test("creates an owned workspace from the existing creation page", async ({ page }) => {
  const idea = `Workspace creation ${crypto.randomUUID()}`;

  await page.goto("/workspaces/new");
  await page.getByLabel("教学构想").fill(idea);
  await page.getByRole("button", { name: "开始创造" }).click();

  await expect(page).toHaveURL(/\/workspaces\/[0-9a-f-]{36}\?conversation=[0-9a-f-]{36}$/, {
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: idea })).toBeVisible();
});

test("uses the optional project name without requiring a second identifier", async ({ page }) => {
  const projectName = `Named workspace ${crypto.randomUUID()}`;

  await page.goto("/workspaces/new");
  await page.getByLabel("教学构想").fill("This longer idea remains future AI input");
  await page.getByText("更多自定义选项", { exact: true }).click();
  await page.getByLabel("项目名称 (可选)").fill(projectName);
  await page.getByRole("button", { name: "开始创造" }).click();

  await expect(page).toHaveURL(/\/workspaces\/[0-9a-f-]{36}\?conversation=[0-9a-f-]{36}$/, {
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
});

test("updates workspace identity through the existing settings control", async ({ page }) => {
  const unique = crypto.randomUUID();
  const name = `Renamed workspace ${unique}`;
  const slug = `renamed-${unique}`;

  await page.goto("/workspaces/new");
  await page.getByLabel("教学构想").fill(`Settings flow ${unique}`);
  await page.getByRole("button", { name: "开始创造" }).click();
  await expect(page).toHaveURL(/\/workspaces\/[0-9a-f-]{36}\?conversation=[0-9a-f-]{36}$/, {
    timeout: 15_000,
  });
  const workspaceId = new URL(page.url()).pathname.split("/").at(-1);
  if (!workspaceId) throw new Error("Created workspace URL did not contain an id");

  await page.getByRole("button", { name: "工作空间设置" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "工作空间设置" })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await page.getByRole("textbox", { name: "工作空间名称" }).fill(name);
  await page.getByRole("textbox", { name: "自定义地址（可选）" }).fill(slug);
  await page.getByRole("button", { name: "保存修改" }).click();

  await expect(page).toHaveURL(new RegExp(`/spectra-e2e/${slug}\\?conversation=[0-9a-f-]{36}$`));
  await expect(page.getByRole("heading", { name })).toBeVisible();

  const changedSlug = `${slug}-changed`;
  await page.getByRole("button", { name: "工作空间设置" }).click();
  await page.getByRole("textbox", { name: "自定义地址（可选）" }).fill(changedSlug);
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/spectra-e2e/${changedSlug}\\?conversation=[0-9a-f-]{36}$`),
  );
  expect((await page.request.get(`/spectra-e2e/${slug}`)).status()).toBe(404);

  await page.getByRole("button", { name: "工作空间设置" }).click();
  await page.getByRole("textbox", { name: "自定义地址（可选）" }).fill("");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/workspaces/${workspaceId}\\?conversation=[0-9a-f-]{36}$`),
  );
  expect((await page.request.get(`/spectra-e2e/${changedSlug}`)).status()).toBe(404);
});

test("renames, archives, opens, restores, and sorts workspaces from the Dashboard", async ({
  page,
}) => {
  const unique = crypto.randomUUID();
  const originalName = `Dashboard lifecycle ${unique}`;
  const renamedName = `Archived reference ${unique}`;

  await page.goto("/workspaces/new");
  await page.getByLabel("教学构想").fill(originalName);
  await page.getByRole("button", { name: "开始创造" }).click();
  await expect(page).toHaveURL(/\/workspaces\/[0-9a-f-]{36}\?conversation=[0-9a-f-]{36}$/, {
    timeout: 15_000,
  });

  await page.goto("/workspaces");
  await page.getByRole("button", { name: `${originalName} 的操作` }).click();
  await page.getByRole("menuitem", { name: "重命名" }).click();
  const renameDialog = page.getByRole("dialog", { name: "重命名工作空间" });
  await renameDialog.getByRole("textbox", { name: "工作空间名称" }).fill(renamedName);
  await renameDialog.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText(renamedName, { exact: true })).toBeVisible();

  const activeCard = page
    .getByText(renamedName, { exact: true })
    .locator("xpath=ancestor::article");
  const workspaceHref = await activeCard
    .getByRole("link", { name: `打开 ${renamedName}` })
    .getAttribute("href");
  if (!workspaceHref) throw new Error("Dashboard workspace did not expose an address");

  await page.getByRole("button", { name: `${renamedName} 的操作` }).click();
  await page.getByRole("menuitem", { name: "归档" }).click();
  await expect(page.getByText(renamedName, { exact: true })).toHaveCount(0);
  expect((await page.request.get(workspaceHref)).status()).toBe(200);

  await page.getByRole("button", { name: /筛选/ }).click();
  await page.getByRole("menuitemradio", { name: "已归档" }).click();
  await expect(page.getByText(renamedName, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: `${renamedName} 的操作` }).click();
  await page.getByRole("menuitem", { name: "恢复" }).click();
  await expect(page.getByText(renamedName, { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /筛选/ }).click();
  await page.getByRole("menuitemradio", { name: "使用中" }).click();
  await expect(page.getByText(renamedName, { exact: true })).toBeVisible();
});

test("adds, opens, and removes Workspace references from Sources", async ({ page }) => {
  test.skip(
    Boolean(process.env.CI),
    "Workspace reference interaction is verified locally and manually.",
  );

  const unique = crypto.randomUUID();
  const workspaceAName = `Reference A ${unique}`;
  const workspaceBName = `Reference B ${unique}`;

  await page.goto("/workspaces/new");
  await page.getByLabel("教学构想").fill(workspaceAName);
  await page.getByRole("button", { name: "开始创造" }).click();
  await expect(page).toHaveURL(/\/workspaces\/[0-9a-f-]{36}\?conversation=[0-9a-f-]{36}$/, {
    timeout: 15_000,
  });
  const workspaceAUrl = page.url();

  await page.goto("/workspaces/new");
  await page.getByLabel("教学构想").fill(workspaceBName);
  await page.getByRole("button", { name: "开始创造" }).click();
  await expect(page).toHaveURL(/\/workspaces\/[0-9a-f-]{36}\?conversation=[0-9a-f-]{36}$/, {
    timeout: 15_000,
  });
  const workspaceBId = new URL(page.url()).pathname.split("/").at(-1);
  if (!workspaceBId) throw new Error("Created target Workspace URL did not contain an id");
  await page.getByRole("button", { name: "分享" }).click();
  const shareDialog = page.getByRole("dialog", { name: "分享工作空间" });
  await shareDialog.getByRole("textbox", { name: "先建立分享地址" }).fill(`ref-${unique}`);
  await shareDialog.getByRole("button", { name: "建立" }).click();
  const allowReferences = shareDialog.getByRole("button", { name: "允许" });
  await allowReferences.click();
  await expect(allowReferences).toHaveAttribute("aria-pressed", "true");
  await shareDialog.getByRole("button", { name: "关闭分享设置" }).click();

  await page.goto(workspaceAUrl);
  await page.getByRole("button", { name: "导入" }).click();
  await page.getByRole("menuitem", { name: "引用工作空间" }).click();
  const referenceDialog = page.getByRole("dialog", { name: "引用工作空间" });
  await referenceDialog.getByRole("textbox", { name: "搜索工作空间" }).fill(workspaceBName);
  await referenceDialog.getByRole("button", { name: "引用", exact: true }).click();

  const workspaceSource = page.getByText(workspaceBName, { exact: true });
  await expect(workspaceSource).toBeVisible();
  await expect(page.getByRole("link", { name: `打开 ${workspaceBName}` })).toHaveAttribute(
    "href",
    `/spectra-e2e/ref-${unique}`,
  );
  await page.getByRole("link", { name: `打开 ${workspaceBName}` }).click();
  await expect(page).toHaveURL(new RegExp(`/spectra-e2e/ref-${unique}`));

  await page.goto(workspaceAUrl);
  await page.getByRole("button", { name: `移除对 ${workspaceBName} 的引用` }).click();
  await expect(
    page.getByText(`只会移除对“${workspaceBName}”的引用，不会删除目标工作空间或其中资料。`),
  ).toBeVisible();
  await page.getByRole("button", { name: "移除引用" }).click();
  await expect(page.getByText(workspaceBName, { exact: true })).toHaveCount(0);
});

test("collapses the Studio into a persistent tool rail", async ({ page }) => {
  const workspaceName = `Studio Rail ${crypto.randomUUID()}`;

  await page.goto("/workspaces/new");
  await page.getByLabel("教学构想").fill(workspaceName);
  await page.getByRole("button", { name: "开始创造" }).click();
  await expect(page).toHaveURL(/\/workspaces\/[0-9a-f-]{36}\?conversation=[0-9a-f-]{36}$/, {
    timeout: 15_000,
  });

  const studioHandle = page.getByTestId("studio-chat-resizer");
  const studioHandleBox = await studioHandle.boundingBox();
  if (!studioHandleBox) throw new Error("Missing studio/chat separator");
  await page.mouse.move(studioHandleBox.x + studioHandleBox.width / 2, studioHandleBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(studioHandleBox.x - 260, studioHandleBox.y + 100);
  await page.mouse.up();
  const rail = page.getByTestId("studio-rail");
  await expect(rail).toBeVisible();
  await expect(page.getByRole("button", { name: "智能课件" })).toBeVisible();
  await expect(page.getByRole("button", { name: "教学文档" })).toBeVisible();

  await expect(page.getByTestId("studio-panel")).toHaveCSS("width", "56px");

  await page.reload();
  await expect(page.getByTestId("studio-rail")).toBeVisible();

  await page.getByRole("button", { name: "打开历史记录" }).click();
  await expect(page.getByTestId("studio-rail")).not.toBeVisible();
  await expect(page.getByText("历史记录", { exact: true })).toBeVisible();

  const sourcesHandle = page.getByTestId("chat-sources-resizer");
  const sourcesHandleBox = await sourcesHandle.boundingBox();
  if (!sourcesHandleBox) throw new Error("Missing chat/sources separator");
  await page.mouse.move(sourcesHandleBox.x + sourcesHandleBox.width / 2, sourcesHandleBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(sourcesHandleBox.x + 260, sourcesHandleBox.y + 100);
  await page.mouse.up();
  const sourcesRail = page.getByTestId("sources-rail");
  await expect(sourcesRail).toBeVisible();
  await expect(page.getByTestId("sources-panel")).toHaveCSS("width", "56px");
  await expect(sourcesRail.getByRole("button", { name: "导入" })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("sources-rail")).toBeVisible();
});
