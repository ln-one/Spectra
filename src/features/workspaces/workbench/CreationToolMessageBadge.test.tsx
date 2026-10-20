import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import { CreationToolMessageBadge } from "./CreationToolMessageBadge";

test("uses the shared creation-tool identity for a sent message", () => {
  const { container } = renderWithIntl(<CreationToolMessageBadge kind="mind_map" />);

  expect(screen.getByText("思维导图")).toBeInTheDocument();
  expect(container.querySelector('[data-studio-tone="teal"]')).toBeInTheDocument();
});
