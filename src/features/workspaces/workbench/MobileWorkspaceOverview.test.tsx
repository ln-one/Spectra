import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import { MobileWorkspaceOverview } from "./MobileWorkspaceOverview";

test("renders the mobile workspace home with real conversation routes", () => {
  renderWithIntl(
    <MobileWorkspaceOverview
      conversations={[
        {
          conversationId: "conversation-1",
          title: "折射实验",
          updatedAt: "2026-10-13T09:00:00.000Z",
        },
      ]}
      newConversationHref="/teacher/optics?conversation=new"
      ownerHandle="teacher"
      sourceCount={8}
      workspaceHref="/teacher/optics"
      workspaceName="光学课程"
    />,
  );

  expect(screen.getByRole("heading", { name: "光学课程" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "新对话" })).toHaveAttribute(
    "href",
    "/teacher/optics?conversation=new",
  );
  expect(screen.getByRole("link", { name: /折射实验/ })).toHaveAttribute(
    "href",
    "/teacher/optics?conversation=conversation-1",
  );
  expect(screen.getByText("8 项资料")).toBeInTheDocument();
});
