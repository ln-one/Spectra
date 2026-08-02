import { createMigratedTestDatabase } from "@tests/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { principals } from "@/database/schema";
import { IdentityError } from "./errors";
import { handleSchema } from "./handle";
import { ensurePrincipalForAuthUser, getActorForAuthUser } from "./service";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query("TRUNCATE TABLE public.workspaces, public.principals CASCADE");
});

afterAll(async () => {
  await testDatabase.destroy();
});

test("normalizes handles and rejects routes reserved by the product", () => {
  expect(handleSchema.parse(" Alice-Notes ")).toBe("alice-notes");
  expect(() => handleSchema.parse("workspaces")).toThrow();
  expect(() => handleSchema.parse("two--dashes")).toThrow();
});

test("creates once and returns the same Actor on an idempotent retry", async () => {
  const first = await ensurePrincipalForAuthUser("auth-alice", "Alice-Notes", testDatabase.db);
  const second = await ensurePrincipalForAuthUser("auth-alice", "alice-notes", testDatabase.db);
  expect(second).toEqual(first);
});

test("classifies both identity and handle uniqueness conflicts", async () => {
  await ensurePrincipalForAuthUser("auth-alice", "alice", testDatabase.db);
  await expect(
    ensurePrincipalForAuthUser("auth-alice", "alice-two", testDatabase.db),
  ).rejects.toMatchObject({ code: "identity_already_bound" });
  await expect(
    ensurePrincipalForAuthUser("auth-bob", "alice", testDatabase.db),
  ).rejects.toMatchObject({ code: "handle_unavailable" });
});

test("uses unique constraints to close concurrent onboarding", async () => {
  const results = await Promise.allSettled([
    ensurePrincipalForAuthUser("auth-alice", "shared-handle", testDatabase.db),
    ensurePrincipalForAuthUser("auth-bob", "shared-handle", testDatabase.db),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((result) => result.status === "rejected");
  expect(rejected).toMatchObject({ reason: { code: "handle_unavailable" } });
});

describe("inactive principals", () => {
  test.each(["disabled", "deleted"])("rejects a %s principal", async (state) => {
    await ensurePrincipalForAuthUser("auth-alice", "alice", testDatabase.db);
    await testDatabase.db
      .update(principals)
      .set(state === "disabled" ? { status: "disabled" } : { deletedAt: new Date() })
      .where(eq(principals.authUserId, "auth-alice"));

    await expect(getActorForAuthUser("auth-alice", testDatabase.db)).rejects.toEqual(
      new IdentityError("principal_disabled"),
    );
  });
});
