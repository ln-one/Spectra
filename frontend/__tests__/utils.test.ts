import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges single class", () => {
    const result = cn("text-red-500");
    expect(result).toBe("text-red-500");
  });

  it("merges multiple classes", () => {
    const result = cn("text-red-500", "bg-blue-500");
    expect(result).toContain("text-red-500");
    expect(result).toContain("bg-blue-500");
  });

  it("handles conditional classes", () => {
    const isActive = true;
    const result = cn("base-class", isActive && "active-class");
    expect(result).toContain("base-class");
    expect(result).toContain("active-class");
  });

  it("filters falsy values", () => {
    const condition = false;
    const result = cn(
      "base-class",
      condition && "hidden-class",
      undefined,
      null
    );
    expect(result).toBe("base-class");
  });
});
