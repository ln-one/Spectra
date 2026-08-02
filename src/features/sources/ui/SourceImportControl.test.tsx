import { fireEvent, screen } from "@testing-library/react";
import { Uppy } from "@uppy/core";
import { UppyContextProvider } from "@uppy/react";
import { expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import { SourceImportControl } from "./SourceImportControl";

function openImportMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "导入" }), {
    button: 0,
    ctrlKey: false,
  });
}

test("gives the Import trigger hover, focus, pressed, and open feedback", () => {
  const uppy = new Uppy({ restrictions: { allowedFileTypes: [".pdf"] } });
  renderWithIntl(
    <UppyContextProvider uppy={uppy}>
      <SourceImportControl onReferenceWorkspace={() => undefined} />
    </UppyContextProvider>,
  );

  expect(screen.getByRole("button", { name: "导入" })).toHaveClass(
    "hover:bg-[var(--workspace-surface-muted)]",
    "focus-visible:ring-2",
    "active:scale-[0.96]",
    "data-[state=open]:bg-[var(--workspace-surface-muted)]",
  );
  uppy.destroy();
});

test("opens the native multi-file picker without an upload dialog", () => {
  const uppy = new Uppy({ restrictions: { allowedFileTypes: [".pdf"] } });
  const { container } = renderWithIntl(
    <UppyContextProvider uppy={uppy}>
      <SourceImportControl onReferenceWorkspace={() => undefined} />
    </UppyContextProvider>,
  );
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Missing Uppy file input");
  const inputClick = vi.spyOn(input, "click");

  openImportMenu();
  fireEvent.click(screen.getByRole("menuitem", { name: "上传资料" }));
  expect(inputClick).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  fireEvent.change(input, {
    target: {
      files: [
        new File(["one"], "lesson.pdf", { type: "application/pdf" }),
        new File(["two"], "notes.pdf", { type: "application/pdf" }),
      ],
    },
  });
  expect(uppy.getFiles().map((file) => file.name)).toEqual(["lesson.pdf", "notes.pdf"]);

  uppy.destroy();
});

test("opens the workspace reference selector from the import menu", () => {
  const uppy = new Uppy({ restrictions: { allowedFileTypes: [".pdf"] } });
  const onReferenceWorkspace = vi.fn();
  renderWithIntl(
    <UppyContextProvider uppy={uppy}>
      <SourceImportControl onReferenceWorkspace={onReferenceWorkspace} />
    </UppyContextProvider>,
  );

  openImportMenu();
  fireEvent.click(screen.getByRole("menuitem", { name: "引用工作空间" }));

  expect(onReferenceWorkspace).toHaveBeenCalledOnce();
  uppy.destroy();
});
