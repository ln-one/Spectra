import { describe, expect, test } from "vitest";
import { testServerEnvironment } from "@/environment/test";
import { authEnvironment } from "./config";

describe("authEnvironment", () => {
  test("uses the local URL outside production", () => {
    expect(authEnvironment(testServerEnvironment({ NODE_ENV: "development" }))).toEqual({
      baseURL: "http://localhost:3000",
      secret: undefined,
      smtp: undefined,
    });
  });

  test("requires an explicit URL and strong secret in production", () => {
    expect(() => authEnvironment(testServerEnvironment({ NODE_ENV: "production" }))).toThrow(
      "BETTER_AUTH_URL is required in production",
    );
    expect(() =>
      authEnvironment(
        testServerEnvironment({
          NODE_ENV: "production",
          BETTER_AUTH_URL: "https://spectra.example.com",
        }),
      ),
    ).toThrow("BETTER_AUTH_SECRET is required in production");
    expect(() =>
      authEnvironment(
        testServerEnvironment({
          NODE_ENV: "production",
          BETTER_AUTH_URL: "https://spectra.example.com",
          BETTER_AUTH_SECRET: "too-short",
        }),
      ),
    ).toThrow("BETTER_AUTH_SECRET must contain at least 32 characters in production");
  });

  test("reads the SMTP configuration when it is provided", () => {
    expect(
      authEnvironment(
        testServerEnvironment({
          EMAIL_FROM: "Spectra <noreply@mail.example.com>",
          SMTP_HOST: "smtp.example.com",
          SMTP_PASSWORD: "smtp-password",
          SMTP_PORT: "465",
          SMTP_SECURE: "true",
          SMTP_USER: "noreply@mail.example.com",
        }),
      ).smtp,
    ).toEqual({
      from: "Spectra <noreply@mail.example.com>",
      host: "smtp.example.com",
      password: "smtp-password",
      port: 465,
      secure: true,
      user: "noreply@mail.example.com",
    });
  });
});
