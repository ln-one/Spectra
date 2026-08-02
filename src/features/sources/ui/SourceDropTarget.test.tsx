import { fireEvent, screen } from "@testing-library/react";
import { Uppy } from "@uppy/core";
import { UppyContextProvider } from "@uppy/react";
import { expect, test } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import { SourceDropTarget } from "./SourceDropTarget";

test("adds files dropped directly onto the Sources panel", () => {
  const uppy = new Uppy({ restrictions: { allowedFileTypes: [".pdf"] } });
  renderWithIntl(
    <UppyContextProvider uppy={uppy}>
      <SourceDropTarget>
        <div>Sources content</div>
      </SourceDropTarget>
    </UppyContextProvider>,
  );
  const target = screen.getByTestId("source-drop-target");
  const file = new File(["content"], "lesson.pdf", { type: "application/pdf" });

  fireEvent.dragEnter(target, { dataTransfer: { files: [file], types: ["Files"] } });
  expect(screen.getByText("松开即可上传")).toBeInTheDocument();
  fireEvent.drop(target, { dataTransfer: { files: [file], types: ["Files"] } });

  expect(screen.queryByText("松开即可上传")).not.toBeInTheDocument();
  expect(uppy.getFiles().map((queuedFile) => queuedFile.name)).toEqual(["lesson.pdf"]);
  uppy.destroy();
});

test("ignores non-file drags and always clears the overlay on drop", () => {
  const uppy = new Uppy();
  renderWithIntl(
    <UppyContextProvider uppy={uppy}>
      <SourceDropTarget>
        <div>Sources content</div>
      </SourceDropTarget>
    </UppyContextProvider>,
  );
  const target = screen.getByTestId("source-drop-target");

  fireEvent.dragEnter(target, { dataTransfer: { files: [], types: ["text/plain"] } });
  expect(screen.queryByText("松开即可上传")).not.toBeInTheDocument();
  fireEvent.drop(target, { dataTransfer: { files: [], types: ["text/plain"] } });
  expect(screen.queryByText("松开即可上传")).not.toBeInTheDocument();
  uppy.destroy();
});
