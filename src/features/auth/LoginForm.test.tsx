import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../tests/render";
import { authClient } from "./client";
import { LoginForm } from "./LoginForm";

vi.mock("./client", () => ({
  authClient: {
    signIn: {
      email: vi.fn(),
      passkey: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.stubGlobal("PublicKeyCredential", class {});
  vi.mocked(authClient.signIn.passkey).mockReset();
});

test("offers passkey sign-in and reports a cancelled system prompt", async () => {
  vi.mocked(authClient.signIn.passkey).mockResolvedValue({
    data: null,
    error: {
      code: "AUTH_CANCELLED",
      message: "cancelled",
      status: 400,
      statusText: "BAD_REQUEST",
    },
  } as never);

  renderWithIntl(<LoginForm redirectPath="/workspaces" />);

  const email = screen.getByRole("textbox", { name: "邮箱" });
  expect(email).toHaveAttribute("autocomplete", "username webauthn");

  const button = screen.getByRole("button", { name: "使用 Passkey 登录" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);

  await waitFor(() => expect(authClient.signIn.passkey).toHaveBeenCalledOnce());
  expect(screen.getByRole("alert")).toHaveTextContent("已取消 Passkey 验证");
});

test("explains that an unverified email must be verified", async () => {
  vi.mocked(authClient.signIn.email).mockResolvedValue({
    data: null,
    error: {
      code: "EMAIL_NOT_VERIFIED",
      message: "unverified",
      status: 403,
      statusText: "FORBIDDEN",
    },
  } as never);
  renderWithIntl(<LoginForm redirectPath="/workspaces" />);

  fireEvent.change(screen.getByRole("textbox", { name: "邮箱" }), {
    target: { value: "alice@example.com" },
  });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "Spectra-password-2026" } });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "请先验证邮箱。我们已重新发送验证邮件。",
  );
});
