import { afterEach, describe, expect, test, vi } from "vitest";
import { authDatabaseUrl, databaseUrl } from "./url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("databaseUrl", () => {
  test("requires explicit production configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    expect(() => databaseUrl()).toThrow("DATABASE_URL is required in production");
  });

  test("isolates Better Auth to its schema", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://spectra:spectra@localhost:5432/spectra_test");
    const url = new URL(authDatabaseUrl());
    expect(url.searchParams.get("options")).toBe("-c search_path=auth");
  });
});
