import { fireEvent, render, screen } from "@testing-library/react";
import { SessionSwitcher } from "@/components/project/features/header/components/SessionSwitcher";

describe("project theme component hooks", () => {
  it("applies theme slot class on session trigger", () => {
    render(
      <SessionSwitcher
        sessions={[
          {
            sessionId: "session_1",
            title: "会话 1",
            updatedAt: "03-21 10:00",
          },
        ]}
        activeSessionId="session_1"
        onChangeSession={jest.fn()}
        onCreateSession={jest.fn()}
        isCreatingSession={false}
      />
    );

    const trigger = screen.getByRole("button", { name: /会话 1/i });
    expect(trigger.className).toContain("project-session-trigger");
  });

  it("opens a centered session manager layer", () => {
    render(
      <SessionSwitcher
        sessions={[
          {
            sessionId: "session_1",
            title: "会话 1",
            updatedAt: "03-21 10:00",
          },
        ]}
        activeSessionId="session_1"
        onChangeSession={jest.fn()}
        onCreateSession={jest.fn()}
        isCreatingSession={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /会话 1/i }));

    expect(screen.getByRole("dialog", { name: "会话管理器" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建会话" })).toBeInTheDocument();
  });
});
