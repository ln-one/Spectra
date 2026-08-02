import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { expectNoSeriousAccessibilityViolations } from "./accessibility";
import { e2eDatabaseUrl } from "./environment";

const validPassword = "Spectra2026E2E!!";

test.describe("authentication flow", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("registers, signs out, and signs back in", async ({ page }) => {
    await page.goto("/auth/register");
    await page.getByLabel("用户名").fill("auth-flow-e2e");
    await page.getByLabel("邮箱").fill("auth-flow-e2e@example.com");
    await page.getByLabel("密码", { exact: true }).fill(validPassword);
    await page.getByLabel("确认密码").fill(validPassword);
    await page.getByRole("button", { name: "暂时仅用密码" }).click();

    await expect(page).toHaveURL(/\/workspaces$/, { timeout: 15_000 });
    await page.getByLabel("打开账户菜单").click();
    await expect(page.getByText("auth-flow-e2e@example.com")).toBeVisible();
    await page.getByRole("menuitem", { name: "设置" }).click();
    await expect(page.locator('input[name="theme"]')).toHaveCount(3);
    await page.getByRole("button", { name: "完成" }).click();
    await page.getByLabel("打开账户菜单").click();
    await page.getByRole("menuitem", { name: "退出登录" }).click();

    await expect(page).toHaveURL(/\/auth\/login$/, { timeout: 15_000 });
    await page.getByLabel("邮箱").fill("auth-flow-e2e@example.com");
    await page.getByLabel("密码").fill(validPassword);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page).toHaveURL(/\/workspaces$/, { timeout: 15_000 });
    await page.reload();
    await expect(page).toHaveURL(/\/workspaces$/, { timeout: 15_000 });
    await page.getByLabel("打开账户菜单").click();
    await page.getByRole("menuitem", { name: "退出登录" }).click();
    await expect(page).toHaveURL(/\/auth\/login$/, { timeout: 15_000 });
  });

  test("recovers from a handle conflict without registering twice", async ({ page }) => {
    await page.goto("/auth/register");
    await page.getByLabel("用户名").fill("spectra-e2e");
    await page.getByLabel("邮箱").fill("handle-conflict-e2e@example.com");
    await page.getByLabel("密码", { exact: true }).fill(validPassword);
    await page.getByLabel("确认密码").fill(validPassword);
    await page.getByRole("button", { name: "暂时仅用密码" }).click();

    await expect(page.getByText("这个用户名已被使用，请选择另一个用户名")).toBeVisible();
    await expect(page.getByLabel("邮箱")).toHaveCount(0);
    await page.getByLabel("用户名").fill("handle-recovered-e2e");
    await page.getByRole("button", { name: "完成创建" }).click();

    await expect(page).toHaveURL(/\/workspaces$/, { timeout: 15_000 });
  });

  test("enforces password length at the server boundary", async ({ request }) => {
    const response = await request.post("/api/auth/sign-up/email", {
      data: {
        name: "password-policy-e2e",
        email: "password-policy-e2e@example.com",
        password: "onlyletters",
      },
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: "Password too short",
    });
  });

  test("lets a disabled principal sign out", async ({ page }) => {
    await page.goto("/auth/register");
    await page.getByLabel("用户名").fill("disabled-e2e");
    await page.getByLabel("邮箱").fill("disabled-e2e@example.com");
    await page.getByLabel("密码", { exact: true }).fill(validPassword);
    await page.getByLabel("确认密码").fill(validPassword);
    await page.getByRole("button", { name: "暂时仅用密码" }).click();
    await expect(page).toHaveURL(/\/workspaces$/, { timeout: 15_000 });

    const pool = new Pool({ connectionString: e2eDatabaseUrl });
    try {
      await pool.query("UPDATE public.principals SET status = 'disabled' WHERE handle = $1", [
        "disabled-e2e",
      ]);
    } finally {
      await pool.end();
    }

    await page.goto("/workspaces");
    await expect(page).toHaveURL(/\/auth\/login\?redirect=/);
    await expect(
      page.getByText("当前 Spectra 身份已停用。您可以退出登录并切换其他账号。"),
    ).toBeVisible();
    await page.getByRole("button", { name: "退出登录" }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);
    await expect(page.getByRole("button", { name: "登录", exact: true })).toBeVisible();
  });

  test("uses the browser language before a locale preference is saved", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();

    await page.goto("/auth/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US");

    await context.close();
  });

  test("keeps authentication pages within the accessibility baseline", async ({
    browser,
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.goto("/auth/login");
    await expectNoSeriousAccessibilityViolations(page);

    const englishContext = await browser.newContext({
      colorScheme: "dark",
      locale: "en-US",
      reducedMotion: "reduce",
    });
    const englishPage = await englishContext.newPage();
    await englishPage.goto("/auth/register");
    await expectNoSeriousAccessibilityViolations(englishPage);
    await englishContext.close();
  });

  test("keeps the login form in keyboard order", async ({ page }) => {
    await page.goto("/auth/login");

    const email = page.getByLabel("邮箱");
    await expect(page.getByRole("button", { name: "登录", exact: true })).toBeEnabled();
    await email.focus();
    await expect(email).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("密码")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "登录", exact: true })).toBeFocused();
  });
});
