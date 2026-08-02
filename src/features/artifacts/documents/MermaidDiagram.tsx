"use client";

import { useEffect, useId, useRef, useState } from "react";

type MermaidRenderState =
  | { status: "loading" }
  | { status: "ready"; svgElement: Element }
  | { status: "failed" };

let renderQueue = Promise.resolve();

function renderMermaid(id: string, source: string, dark: boolean) {
  const task = renderQueue.then(async () => {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      flowchart: { htmlLabels: false },
      securityLevel: "strict",
      startOnLoad: false,
      suppressErrorRendering: true,
      theme: dark ? "dark" : "default",
    });
    return mermaid.render(id, source);
  });
  renderQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

function parseMermaidSvg(svg: string) {
  const documentNode = new DOMParser().parseFromString(svg, "image/svg+xml");
  const element = documentNode.documentElement;
  if (documentNode.querySelector("parsererror") || element.localName !== "svg") {
    return null;
  }
  return element;
}

export function MermaidDiagram({ errorLabel, source }: { errorLabel: string; source: string }) {
  const reactId = useId();
  const [themeVersion, setThemeVersion] = useState(0);
  const [state, setState] = useState<MermaidRenderState>({ status: "loading" });

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((value) => value + 1));
    observer.observe(document.documentElement, {
      attributeFilter: ["class", "data-theme"],
      attributes: true,
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    const dark = document.documentElement.classList.contains("dark");
    const id = `mermaid-${reactId.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}-${themeVersion}`;
    void renderMermaid(id, source.trim(), dark).then(
      ({ svg }) => {
        if (!active) return;
        const svgElement = parseMermaidSvg(svg);
        setState(svgElement ? { status: "ready", svgElement } : { status: "failed" });
      },
      () => {
        if (active) setState({ status: "failed" });
      },
    );
    return () => {
      active = false;
    };
  }, [reactId, source, themeVersion]);

  if (state.status === "failed") {
    return (
      <figure className="teaching-document-mermaid teaching-document-mermaid-failed">
        <figcaption role="alert">{errorLabel}</figcaption>
        <pre>
          <code className="language-mermaid">{source}</code>
        </pre>
      </figure>
    );
  }
  if (state.status === "loading") {
    return <div className="teaching-document-mermaid h-48 animate-pulse" aria-busy="true" />;
  }
  return <MermaidSvg svgElement={state.svgElement} />;
}

function MermaidSvg({ svgElement }: { svgElement: Element }) {
  const containerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Mermaid strict mode sanitizes the SVG. Import the parsed SVG without executing HTML.
    container.replaceChildren(document.importNode(svgElement, true));
  }, [svgElement]);
  return (
    <figure ref={containerRef} aria-label="Mermaid diagram" className="teaching-document-mermaid" />
  );
}
