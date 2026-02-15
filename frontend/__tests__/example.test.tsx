import { render, screen } from "@testing-library/react";

describe("Example", () => {
  it("works", () => {
    expect(true).toBe(true);
  });

  it("does math", () => {
    expect(1 + 1).toBe(2);
  });
});

describe("Utils", () => {
  it("concatenates strings", () => {
    const result = "Hello" + " " + "World";
    expect(result).toBe("Hello World");
  });

  it("handles arrays", () => {
    const arr = [1, 2, 3];
    expect(arr).toHaveLength(3);
    expect(arr).toContain(2);
  });
});
