import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

const DEFAULT_AUTH_URL = "http://localhost:3000";

export type AuthSmtpConfiguration = {
  from: string;
  host: string;
  password: string;
  port: number;
  secure: boolean;
  user: string;
};

function smtpConfiguration(environment: ServerEnvironment): AuthSmtpConfiguration | undefined {
  const {
    EMAIL_FROM: from,
    SMTP_HOST: host,
    SMTP_PASSWORD: password,
    SMTP_PORT: port,
    SMTP_USER: user,
  } = environment;
  if (!from || !host || !password || port === undefined || !user) return undefined;

  return {
    from,
    host,
    password,
    port,
    secure: environment.SMTP_SECURE,
    user,
  };
}

export function authEnvironment(environment: ServerEnvironment = serverEnvironment()) {
  const production = environment.NODE_ENV === "production";
  const baseURL = environment.BETTER_AUTH_URL;
  const secret = environment.BETTER_AUTH_SECRET;

  if (production && !baseURL) throw new Error("BETTER_AUTH_URL is required in production");
  if (production && !secret) throw new Error("BETTER_AUTH_SECRET is required in production");
  if (production && secret && secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters in production");
  }

  const smtp = smtpConfiguration(environment);
  return { baseURL: baseURL ?? DEFAULT_AUTH_URL, secret, smtp };
}
