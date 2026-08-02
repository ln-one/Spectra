import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../tests/render";
import { onboardPrincipal } from "./actions";
import { authClient } from "./client";
import { RegisterForm } from "./RegisterForm";

vi.mock("./actions", () => ({ onboardPrincipal: vi.fn() }));
vi.mock("./client", () => ({
  authClient: {
    passkey: { addPasskey: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));

beforeEach(() => {
  vi.stubGlobal("PublicKeyCredential", class {});
  vi.mocked(authClient.passkey.addPasskey).mockReset();
  vi.mocked(authClient.signUp.email).mockResolvedValue({ data: {}, error: null } as never);
  vi.mocked(onboardPrincipal).mockReset();
  vi.mocked(onboardPrincipal).mockResolvedValue({
    ok: false,
    code: "onboarding_failed",
  });
});

test("marks email as the saved login identifier instead of the public handle", () => {
  renderWithIntl(
    <RegisterForm redirectPath="/workspaces" onboardingOnly={false} signUpEnabled={true} />,
  );

  expect(screen.getByLabelText("邮箱")).toHaveAttribute("autocomplete", "username");
  expect(screen.getByLabelText("用户名")).toHaveAttribute("autocomplete", "nickname");
});

test("retries only principal onboarding after the account is created", async () => {
  renderWithIntl(
    <RegisterForm redirectPath="/workspaces" onboardingOnly={false} signUpEnabled={true} />,
  );

  fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "alice-notes" } });
  fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "alice@example.com" } });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "Spectra-password-2026" },
  });
  fireEvent.change(screen.getByLabelText("确认密码"), {
    target: { value: "Spectra-password-2026" },
  });
  fireEvent.click(screen.getByRole("button", { name: "注册并设置 Passkey" }));

  await screen.findByText("账号已创建，但 Spectra 身份初始化失败，请重试");
  expect(screen.queryByLabelText("邮箱")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "完成创建" }));
  await waitFor(() => expect(onboardPrincipal).toHaveBeenCalledTimes(2));
  expect(authClient.signUp.email).toHaveBeenCalledTimes(1);
});

test("prompts for a platform passkey immediately after account creation", async () => {
  vi.mocked(onboardPrincipal).mockResolvedValue({ ok: true });
  vi.mocked(authClient.passkey.addPasskey).mockResolvedValue({
    data: null,
    error: {
      code: "REGISTRATION_CANCELLED",
      message: "cancelled",
      status: 400,
      statusText: "BAD_REQUEST",
    },
  } as never);
  renderWithIntl(
    <RegisterForm redirectPath="/workspaces" onboardingOnly={false} signUpEnabled={true} />,
  );

  fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "alice-notes" } });
  fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "alice@example.com" } });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "Spectra-password-2026" },
  });
  fireEvent.change(screen.getByLabelText("确认密码"), {
    target: { value: "Spectra-password-2026" },
  });
  fireEvent.click(screen.getByRole("button", { name: "注册并设置 Passkey" }));

  await waitFor(() =>
    expect(authClient.passkey.addPasskey).toHaveBeenCalledWith({
      authenticatorAttachment: "platform",
      name: "主要 Passkey",
    }),
  );
  expect(screen.getByRole("heading", { name: "账号已经创建" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("已取消 Passkey 验证");
  expect(screen.getByRole("button", { name: "创建 Passkey" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "暂时跳过，进入工作台" })).toBeInTheDocument();
});

test("explains when Better Auth rejects a breached password", async () => {
  vi.mocked(authClient.signUp.email).mockResolvedValue({
    data: null,
    error: {
      code: "PASSWORD_COMPROMISED",
      message: "compromised",
      status: 400,
      statusText: "BAD_REQUEST",
    },
  } as never);
  renderWithIntl(
    <RegisterForm redirectPath="/workspaces" onboardingOnly={false} signUpEnabled={true} />,
  );

  fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "alice-notes" } });
  fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "alice@example.com" } });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "Spectra-password-2026" },
  });
  fireEvent.change(screen.getByLabelText("确认密码"), {
    target: { value: "Spectra-password-2026" },
  });
  fireEvent.click(screen.getByRole("button", { name: "注册并设置 Passkey" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "此密码曾出现在已知数据泄漏中，请换一个",
  );
  expect(onboardPrincipal).not.toHaveBeenCalled();
});
