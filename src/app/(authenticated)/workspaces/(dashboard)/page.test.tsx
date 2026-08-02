import { screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { getCurrentActor } from "@/features/identity/current";
import { listSharedWorkspaces, listWorkspaces } from "@/features/workspaces/service";
import { renderWithIntl } from "../../../../../tests/render";
import WorkspacesPage from "./page";

vi.mock("@/features/identity/current", () => ({
  getCurrentActor: vi.fn(),
}));

vi.mock("@/features/workspaces/service", () => ({
  listSharedWorkspaces: vi.fn(),
  listWorkspaces: vi.fn(),
}));

test("loads the actor and workspaces through the feature API", async () => {
  vi.mocked(getCurrentActor).mockResolvedValue({
    principalId: "owner-id",
    handle: "developer",
  });
  vi.mocked(listWorkspaces).mockResolvedValue([
    {
      id: "workspace-id",
      ownerId: "owner-id",
      ownerHandle: "developer",
      slug: "biology",
      name: "生物知识库",
      visibility: "private",
      archivedAt: null,
      createdAt: "2026-07-14T00:00:00Z",
      updatedAt: "2026-07-14T00:00:00Z",
    },
  ]);
  vi.mocked(listSharedWorkspaces).mockResolvedValue([]);

  renderWithIntl(await WorkspacesPage());

  expect(screen.getByRole("heading", { name: "生物知识库" })).toBeInTheDocument();
  expect(screen.getByText("/developer/biology")).toBeInTheDocument();
});
