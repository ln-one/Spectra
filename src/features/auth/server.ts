import { passkey } from "@better-auth/passkey";
import { loadEnvConfig } from "@next/env";
import { betterAuth } from "better-auth";
import { haveIBeenPwned } from "better-auth/plugins";
import { Pool } from "pg";
import { databasePoolProfiles } from "@/database/pool-profiles";
import { authDatabaseUrl } from "@/database/url";
import { serverEnvironment } from "@/environment/server";
import { authEnvironment } from "./config";
import { reportAuthenticationEmailFailure, sendAuthenticationEmail } from "./email.server";
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
      if (!smtp) throw new Error("SMTP is not configured");
      try {
        await sendAuthenticationEmail(smtp, user.email, "password-reset", url);
      } catch {
        reportAuthenticationEmailFailure();
        throw new Error("Authentication email delivery failed");
      }
    },
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    sendOnSignIn: true,
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      if (!smtp) throw new Error("SMTP is not configured");
      try {
        await sendAuthenticationEmail(smtp, user.email, "verification", url);
      } catch {
        reportAuthenticationEmailFailure();
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
