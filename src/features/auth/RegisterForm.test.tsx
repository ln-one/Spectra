import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../tests/render";
import { onboardPrincipal } from "./actions";
import { authClient } from "./client";
import { RegisterForm } from "./RegisterForm";

vi.mock("./actions", () => ({ onboardPrincipal: vi.fn() }));
vi.mock("./client", () => ({
  authClient: {
    signUp: { email: vi.fn() },
  },
}));

beforeEach(() => {
  vi.mocked(authClient.signUp.email).mockReset();
  vi.mocked(authClient.signUp.email).mockResolvedValue({ data: {}, error: null } as never);
  vi.mocked(onboardPrincipal).mockReset();
});

function fillRegistrationForm() {
  fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "alice-notes" } });
  fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "alice@example.com" } });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "Spectra-password-2026" },
  });
  fireEvent.change(screen.getByLabelText("确认密码"), {
    target: { value: "Spectra-password-2026" },
  });
}

test("marks email as the saved login identifier instead of the public handle", () => {
  renderWithIntl(
    <RegisterForm redirectPath="/workspaces" onboardingOnly={false} signUpEnabled={true} />,
  );

  expect(screen.getByLabelText("邮箱")).toHaveAttribute("autocomplete", "username");
  expect(screen.getByLabelText("用户名")).toHaveAttribute("autocomplete", "nickname");
});

test("sends verification before principal onboarding", async () => {
  renderWithIntl(
    <RegisterForm redirectPath="/workspaces" onboardingOnly={false} signUpEnabled={true} />,
  );
  fillRegistrationForm();
  fireEvent.click(screen.getByRole("button", { name: "创建账号并验证邮箱" }));

  await screen.findByText("验证邮件已发送");
  expect(authClient.signUp.email).toHaveBeenCalledWith({
    callbackURL: "/auth/register?redirect=%2Fworkspaces&mode=handle",
    email: "alice@example.com",
    name: "alice-notes",
    password: "Spectra-password-2026",
  });
  expect(onboardPrincipal).not.toHaveBeenCalled();
});

test("completes principal onboarding only after verification", async () => {
  vi.mocked(onboardPrincipal).mockResolvedValue({ ok: true });
  renderWithIntl(<RegisterForm redirectPath="/workspaces" onboardingOnly signUpEnabled={true} />);

  fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "alice-notes" } });
  fireEvent.click(screen.getByRole("button", { name: "完成创建" }));

  await waitFor(() => expect(onboardPrincipal).toHaveBeenCalledWith("alice-notes"));
  expect(authClient.signUp.email).not.toHaveBeenCalled();
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
  fillRegistrationForm();
  fireEvent.click(screen.getByRole("button", { name: "创建账号并验证邮箱" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "此密码曾出现在已知数据泄漏中，请换一个",
  );
  expect(onboardPrincipal).not.toHaveBeenCalled();
});
