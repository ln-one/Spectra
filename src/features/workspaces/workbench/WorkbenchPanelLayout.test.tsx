import { fireEvent, screen } from "@testing-library/react";
import { FileText } from "lucide-react";
import { beforeEach, expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import { SourcesPanelView } from "./SourcesPanelView";
import {
  sourceRailPreferenceKey,
  studioRailPreferenceKey,
  WorkbenchPanelLayout,
} from "./WorkbenchPanelLayout";

const workspaceId = "00000000-0000-4000-8000-000000000501";
const storedPreferences = new Map<string, string>();

beforeEach(() => {
  storedPreferences.clear();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => storedPreferences.get(key) ?? null),
      removeItem: vi.fn((key: string) => storedPreferences.delete(key)),
      setItem: vi.fn((key: string, value: string) => storedPreferences.set(key, value)),
    },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
  Element.prototype.scrollIntoView = vi.fn();
});

test("uses a Workspace-scoped key for the Studio rail preference", () => {
  expect(studioRailPreferenceKey(workspaceId)).toBe(
    `spectra:workspace:${workspaceId}:studio-panel`,
  );
});

test("collapses, expands, and stores the Studio rail preference", () => {
  window.localStorage.removeItem(studioRailPreferenceKey(workspaceId));
  renderWithIntl(
    <WorkbenchPanelLayout
      workspaceId={workspaceId}
      chat={<div>Assistant</div>}
      disclaimer="Disclaimer"
      sources={<div>Sources</div>}
      studio={({ collapse, collapsed, expand }) => (
        <div>
          <span>{collapsed ? "Rail" : "Full studio"}</span>
          <button type="button" onClick={collapse}>
            Collapse test studio
          </button>
          <button type="button" onClick={expand}>
            Expand test studio
          </button>
        </div>
      )}
    />,
  );

  expect(screen.getByText("Full studio")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Collapse test studio" }));
  expect(screen.getByText("Rail")).toBeInTheDocument();
  expect(window.localStorage.getItem(studioRailPreferenceKey(workspaceId))).toBe("collapsed");

  fireEvent.click(screen.getByRole("button", { name: "Expand test studio" }));
  expect(screen.getByText("Full studio")).toBeInTheDocument();
  expect(window.localStorage.getItem(studioRailPreferenceKey(workspaceId))).toBe("expanded");
});

test("restores a collapsed Studio rail preference", () => {
  window.localStorage.setItem(studioRailPreferenceKey(workspaceId), "collapsed");
  renderWithIntl(
    <WorkbenchPanelLayout
      workspaceId={workspaceId}
      chat={<div>Assistant</div>}
      disclaimer="Disclaimer"
      sources={<div>Sources</div>}
      studio={({ collapsed }) => <div>{collapsed ? "Restored rail" : "Full studio"}</div>}
    />,
  );

  expect(screen.getByText("Restored rail")).toBeInTheDocument();
});

test("restores a collapsed Sources rail and expands to the selected Source", () => {
  window.localStorage.setItem(sourceRailPreferenceKey(workspaceId), "collapsed");
  renderWithIntl(
    <WorkbenchPanelLayout
      workspaceId={workspaceId}
      chat={<div>Assistant</div>}
      disclaimer="Disclaimer"
      sources={
        <SourcesPanelView
          title="资料来源"
          summary="1 项资料"
          importControl={<button type="button">导入</button>}
          sources={[
            {
              id: "source-1",
              name: "课程讲义.pdf",
              status: "已就绪",
              Icon: FileText,
              kind: "file",
              iconTone: "pdf",
              selected: false,
              canOpen: false,
              canDelete: true,
              statusTone: "success",
            },
          ]}
        />
      }
      studio={({ collapsed }) => <div>{collapsed ? "Rail" : "Full studio"}</div>}
    />,
  );

  expect(screen.getByTestId("sources-rail")).toBeVisible();
  expect(window.localStorage.getItem(sourceRailPreferenceKey(workspaceId))).toBe("collapsed");
  expect(screen.getByRole("button", { name: "导入" })).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "查看资料：课程讲义.pdf" }));
  expect(screen.queryByTestId("sources-rail")).not.toBeInTheDocument();
  expect(screen.getByText("课程讲义.pdf").closest("[data-source-id]")).toHaveFocus();
  expect(window.localStorage.getItem(sourceRailPreferenceKey(workspaceId))).toBe("expanded");
});
