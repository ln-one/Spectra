import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../tests/render";
import { authClient } from "./client";
import { PasskeySettings } from "./PasskeySettings";

vi.mock("./client", () => ({
  authClient: {
    passkey: {
      addPasskey: vi.fn(),
      deletePasskey: vi.fn(),
      listUserPasskeys: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.stubGlobal("PublicKeyCredential", class {});
  vi.mocked(authClient.passkey.addPasskey).mockReset();
  vi.mocked(authClient.passkey.deletePasskey).mockReset();
  vi.mocked(authClient.passkey.listUserPasskeys).mockReset();
});

test("adds a passkey and refreshes the user's credential list", async () => {
  vi.mocked(authClient.passkey.listUserPasskeys)
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({
      data: [
        {
          aaguid: "",
          backedUp: true,
          counter: 0,
          createdAt: new Date("2026-07-29T00:00:00.000Z"),
          credentialID: "credential-1",
          deviceType: "multiDevice",
          id: "passkey-1",
          name: "此设备",
          publicKey: "public-key",
          transports: "internal",
          userId: "user-1",
        },
      ],
      error: null,
    } as never);
  vi.mocked(authClient.passkey.addPasskey).mockResolvedValue({
    data: { id: "passkey-1" },
    error: null,
  } as never);

  renderWithIntl(<PasskeySettings />);

  expect(await screen.findByText("还没有 Passkey。添加后即可免密码登录。")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "添加 Passkey" }));

  await waitFor(() =>
    expect(authClient.passkey.addPasskey).toHaveBeenCalledWith({
      name: "此设备",
    }),
  );
  expect(await screen.findByText("此设备")).toBeInTheDocument();
});
