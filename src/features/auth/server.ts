import { passkey } from "@better-auth/passkey";
import { loadEnvConfig } from "@next/env";
import { betterAuth } from "better-auth";
import { haveIBeenPwned } from "better-auth/plugins";
import { Pool } from "pg";
import { databasePoolProfiles } from "@/database/pool-profiles";
import { authDatabaseUrl } from "@/database/url";
import { serverEnvironment } from "@/environment/server";
import { authEnvironment } from "./config";
import { isSignUpEnabled } from "./policy";

loadEnvConfig(process.cwd());
const environment = serverEnvironment();
const { baseURL, secret, smtp } = authEnvironment(environment);
const authOrigin = new URL(baseURL);

const globalAuthDatabase = globalThis as typeof globalThis & {
  spectraAuthPool?: Pool;
};

const authPool =
  globalAuthDatabase.spectraAuthPool ??
  new Pool({
    application_name: databasePoolProfiles.auth.applicationName,
    connectionString: authDatabaseUrl(environment),
    max: databasePoolProfiles.auth.max,
  });

if (environment.NODE_ENV !== "production") {
  // Preserve the pool across Next.js development module reloads.
  globalAuthDatabase.spectraAuthPool = authPool;
}

async function sendAuthenticationEmail(
  recipient: string,
  kind: "password-reset" | "verification",
  url: string,
) {
  if (!smtp) throw new Error("SMTP is not configured");

  // The migration CLI loads this configuration outside Next.js, where server-only is unavailable.
  const { sendAuthenticationEmail: deliver } = await import("./email.server");
  await deliver(smtp, recipient, kind, url);
}

async function reportAuthenticationEmailFailure() {
  const { reportAuthenticationEmailFailure: report } = await import("./email.server");
  report();
}

export const auth = betterAuth({
  appName: "Spectra",
  baseURL,
  database: authPool,
  emailAndPassword: {
    enabled: true,
    disableSignUp: !isSignUpEnabled(environment),
    minPasswordLength: 15,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      try {
        await sendAuthenticationEmail(user.email, "password-reset", url);
      } catch {
        await reportAuthenticationEmailFailure();
        throw new Error("Authentication email delivery failed");
      }
    },
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    sendOnSignIn: true,
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      try {
        await sendAuthenticationEmail(user.email, "verification", url);
      } catch {
        await reportAuthenticationEmailFailure();
        throw new Error("Authentication email delivery failed");
      }
    },
  },
  session: {
    // Default 24h is too short for passkey registration; allow 30 days.
    freshAge: 60 * 60 * 24 * 30,
  },
  plugins: [
    haveIBeenPwned({
      enabled: environment.NODE_ENV === "production",
    }),
    passkey({
      origin: authOrigin.origin,
      rpID: authOrigin.hostname,
      rpName: "Spectra",
    }),
  ],
  secret,
  trustedOrigins: [baseURL],
});
