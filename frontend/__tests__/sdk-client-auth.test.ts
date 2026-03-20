import { shouldSkipAuth } from "@/lib/sdk/client";

describe("sdk client auth skipping", () => {
  test("keeps auth enabled for /api/v1/auth/me", () => {
    expect(shouldSkipAuth("/api/v1/auth/me")).toBe(false);
  });

  test("keeps auth enabled for /api/v1/auth/logout", () => {
    expect(shouldSkipAuth("/api/v1/auth/logout")).toBe(false);
  });

  test("skips auth only for login register and refresh", () => {
    expect(shouldSkipAuth("/api/v1/auth/login")).toBe(true);
    expect(shouldSkipAuth("/api/v1/auth/register")).toBe(true);
    expect(shouldSkipAuth("/api/v1/auth/refresh")).toBe(true);
  });
});
