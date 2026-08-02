import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

const DEFAULT_AUTH_URL = "http://localhost:3000";

export function authEnvironment(environment: ServerEnvironment = serverEnvironment()) {
  const production = environment.NODE_ENV === "production";
  const baseURL = environment.BETTER_AUTH_URL;
  const secret = environment.BETTER_AUTH_SECRET;

  if (production && !baseURL) throw new Error("BETTER_AUTH_URL is required in production");
  if (production && !secret) throw new Error("BETTER_AUTH_SECRET is required in production");
  if (production && secret && secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters in production");
  }

  return { baseURL: baseURL ?? DEFAULT_AUTH_URL, secret };
}
