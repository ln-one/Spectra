import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import { GameWorkspaceView } from "./GameWorkspaceView";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const conversationId = "00000000-0000-4000-8000-000000000005";

test("shows Game prompt suggestions before generation and injects the selected prompt", async () => {
  const suggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `Game prompt ${index}`,
    title: `Game suggestion ${index}`,
  }));
  const fetchMock = vi.fn(async () => Response.json({ status: "fresh", suggestions }));
  vi.stubGlobal("fetch", fetchMock);
  const onSuggestion = vi.fn();

  renderWithIntl(
    <GameWorkspaceView
      artifact={null}
      conversationId={conversationId}
      failureCode={null}
      onBack={vi.fn()}
      onSuggestion={onSuggestion}
      pendingTitle={null}
      phase="idle"
      workspaceId={workspaceId}
    />,
  );

  expect(screen.queryByTestId("game-generation-skeleton")).not.toBeInTheDocument();
  expect(screen.getAllByTestId("suggestion-card-skeleton")).toHaveLength(4);
  const suggestion = await screen.findByRole("button", { name: /Game suggestion 0/ });
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/artifacts/suggestions?locale=zh-CN&target=game&view=artifact-v1&workspaceId=${workspaceId}`,
  );
  fireEvent.click(suggestion);
  expect(onSuggestion).toHaveBeenCalledWith("Game prompt 0");
});

test("shows the Game generation scene only after generation starts", () => {
  vi.stubGlobal("fetch", vi.fn());

  renderWithIntl(
    <GameWorkspaceView
      artifact={null}
      conversationId={conversationId}
      failureCode={null}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle="Generated game"
      phase="generating"
      workspaceId={workspaceId}
    />,
  );

  expect(screen.getByRole("status")).toHaveTextContent("正在生成游戏");
  expect(screen.getByTestId("game-generation-skeleton")).toHaveClass("items-center");
  expect(screen.queryByTestId("suggestion-card-skeleton")).not.toBeInTheDocument();
});

test("shows a readable recovery action instead of the raw Game failure code", () => {
  vi.stubGlobal("fetch", vi.fn());
  const onBack = vi.fn();

  renderWithIntl(
    <GameWorkspaceView
      artifact={null}
      conversationId={conversationId}
      failureCode="game_invalid_output"
      onBack={onBack}
      onSuggestion={vi.fn()}
      pendingTitle="Generated game"
      phase="failed"
      workspaceId={workspaceId}
    />,
  );

  expect(screen.getByTestId("game-generation-failure")).toHaveTextContent(
    "题库内容没有通过格式校验",
  );
  expect(screen.queryByText("game_invalid_output")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "返回重新生成" }));
  expect(onBack).toHaveBeenCalledOnce();
});
