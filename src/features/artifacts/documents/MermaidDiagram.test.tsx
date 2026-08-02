import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MermaidDiagram } from "./MermaidDiagram";

const renderMermaid = vi.fn();
const initializeMermaid = vi.fn();

vi.mock("mermaid", () => ({
  default: {
    initialize: initializeMermaid,
    render: renderMermaid,
  },
}));

describe("MermaidDiagram", () => {
  beforeEach(() => {
    initializeMermaid.mockClear();
    renderMermaid.mockReset();
  });

  it("renders Mermaid source as strict SVG", async () => {
    renderMermaid.mockResolvedValue({ svg: '<svg aria-label="Rendered graph"></svg>' });

    render(<MermaidDiagram errorLabel="Unable to render" source="graph TD\nA --> B" />);

    expect(await screen.findByLabelText("Rendered graph")).toBeTruthy();
    expect(initializeMermaid).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: "strict", startOnLoad: false }),
    );
  });

  it("preserves source when Mermaid rejects invalid syntax", async () => {
    renderMermaid.mockRejectedValue(new Error("invalid syntax"));

    render(<MermaidDiagram errorLabel="Unable to render" source="graph ???" />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Unable to render"));
    expect(screen.getByText("graph ???")).toBeInTheDocument();
  });

  it("preserves source when Mermaid returns a non-SVG payload", async () => {
    renderMermaid.mockResolvedValue({ svg: "<html>not an svg</html>" });

    render(<MermaidDiagram errorLabel="Unable to render" source="graph TD\nA --> B" />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Unable to render"));
    expect(screen.getByText(/graph TD/)).toBeInTheDocument();
  });
});
