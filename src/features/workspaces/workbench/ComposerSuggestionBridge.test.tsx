// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import type { ComposerSuggestion } from "./WorkbenchChatRuntime";

const setText = vi.fn();

vi.mock("@assistant-ui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@assistant-ui/react")>()),
  useAui: () => ({ composer: () => ({ setText }) }),
}));

import { ComposerSuggestionBridge } from "./WorkbenchChatRuntime";

function Harness({ children }: { children?: ReactNode }) {
  const [suggestion, setSuggestion] = useState<ComposerSuggestion | null>({
    id: 1,
    text: "Create the document",
  });
  return (
    <>
      <ComposerSuggestionBridge
        suggestion={suggestion}
        onConsumed={(id) => setSuggestion((current) => (current?.id === id ? null : current))}
      />
      {children}
    </>
  );
}

beforeEach(() => setText.mockReset());

test("consumes a suggestion after filling the composer so runtime remounts cannot restore it", async () => {
  const view = render(<Harness />);

  await waitFor(() => expect(setText).toHaveBeenCalledTimes(1));
  expect(setText).toHaveBeenCalledWith("Create the document");

  view.rerender(
    <Harness>
      <span>server messages changed</span>
    </Harness>,
  );
  await waitFor(() => expect(setText).toHaveBeenCalledTimes(1));
});
