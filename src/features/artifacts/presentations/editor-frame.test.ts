import { expect, test } from "vitest";
import { resolvePresentationEditorEndpoint } from "./editor-frame";

test("resolves the local editor and binds it to the parent origin", () => {
  expect(
    resolvePresentationEditorEndpoint("http://localhost:3000", {
      editorUrl: "/deckelier/index.html",
    }),
  ).toEqual({
    href: "http://localhost:3000/deckelier/index.html?parentOrigin=http%3A%2F%2Flocalhost%3A3000",
    origin: "http://localhost:3000",
  });
});

test("resolves a hosted preview without changing its existing version query", () => {
  expect(
    resolvePresentationEditorEndpoint("https://app.spectra.example", {
      editorUrl: "https://editor.spectra.example/index.html?v=1",
      surface: "stream-preview",
    }),
  ).toEqual({
    href: "https://editor.spectra.example/index.html?v=1&parentOrigin=https%3A%2F%2Fapp.spectra.example&surface=stream-preview",
    origin: "https://editor.spectra.example",
  });
});

test("rejects an insecure remote editor", () => {
  expect(() =>
    resolvePresentationEditorEndpoint("https://app.spectra.example", {
      editorUrl: "http://editor.example/index.html",
    }),
  ).toThrow("presentation_editor_url_invalid");
});
