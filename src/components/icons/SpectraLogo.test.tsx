import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { SpectraLogo } from "./SpectraLogo";

test("uses unique gradient ids for every logo instance", () => {
  const { container } = render(
    <>
      <SpectraLogo />
      <SpectraLogo />
    </>,
  );

  const ids = [...container.querySelectorAll("linearGradient")].map((gradient) => gradient.id);
  expect(new Set(ids).size).toBe(ids.length);
});
