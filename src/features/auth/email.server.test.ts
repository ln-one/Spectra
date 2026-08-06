import { expect, test } from "vitest";
import { authenticationEmail } from "./email.server";

test("renders a verification email without interpolating a raw URL into HTML", () => {
  const email = authenticationEmail(
    "verification",
    "https://spectra.example.com/api/auth/verify-email?token=a&callbackURL=%2Fworkspaces",
  );

  expect(email.subject).toBe("验证你的 Spectra 邮箱");
  expect(email.text).toContain("验证邮箱:");
  expect(email.html).toContain("token=a&amp;callbackURL=%2Fworkspaces");
});
