import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { setLocale } from "@/i18n/actions";
import { renderWithIntl } from "../../../tests/render";
import { AccountMenu } from "./AccountMenu";
import { authClient } from "./client";

const setTheme = vi.fn();

vi.mock("@/i18n/actions", () => ({ setLocale: vi.fn() }));
vi.mock("@/features/preferences/theme", () => ({
  useAppTheme: () => ({ setTheme, theme: "system" }),
}));
vi.mock("./client", () => ({
  authClient: {
    passkey: {
      listUserPasskeys: vi.fn().mockResolvedValue({ data: [], error: null }),
    },
    signOut: vi.fn(),
  },
}));

beforeEach(() => {
  setTheme.mockReset();
  vi.mocked(setLocale).mockReset();
  vi.mocked(setLocale).mockResolvedValue(undefined);
  vi.mocked(authClient.signOut).mockReset();
});

function openAccountMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "打开账户菜单" }), {
    button: 0,
    ctrlKey: false,
  });
}

test("keeps identity actions in the account menu and moves preferences into settings", async () => {
  renderWithIntl(
    <AccountMenu handle="developer" email="developer@spectra.local" appearance="dashboard" />,
  );

  openAccountMenu();
  expect(screen.getByText("developer@spectra.local")).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "设置" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "退出登录" })).toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: "浅色" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("menuitem", { name: "设置" }));

  expect(screen.getByRole("dialog", { name: "设置" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "浅色" }));
  expect(setTheme).toHaveBeenCalledWith("light");

  fireEvent.click(screen.getByRole("radio", { name: "English" }));
  await waitFor(() => expect(setLocale).toHaveBeenCalledWith("en-US"));
});

test("keeps sign-out failures visible in the account menu", async () => {
  vi.mocked(authClient.signOut).mockResolvedValue({ error: { message: "failed" } } as never);
  renderWithIntl(
    <AccountMenu handle="developer" email="developer@spectra.local" appearance="workbench" />,
  );

  openAccountMenu();
  fireEvent.click(screen.getByRole("menuitem", { name: "退出登录" }));

  await waitFor(() => expect(authClient.signOut).toHaveBeenCalledOnce());
  expect(screen.getByRole("alert")).toHaveTextContent("退出失败，请重试");
});
