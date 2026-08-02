import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { WorkspaceSourceIcon } from "./WorkspaceSourceIcon";

test("expresses a Workspace reference as an entry into a reachable network", () => {
  const { container } = render(<WorkspaceSourceIcon />);

  expect(container.querySelector('[data-part="workspace-network-entry"]')).toBeInTheDocument();
  expect(container.querySelector('[data-part="workspace-network-edge"]')).toBeInTheDocument();
  expect(container.querySelectorAll('[data-part="workspace-network-node"]')).toHaveLength(3);
  expect(container.querySelector('[data-part="workspace-network-portal"]')).toBeInTheDocument();
  expect(container.querySelector("linearGradient")).not.toBeInTheDocument();
});
