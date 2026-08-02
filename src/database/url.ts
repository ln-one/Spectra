import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

const DEFAULT_DATABASE_URL = "postgresql://spectra:spectra@localhost:5432/spectra";

export function databaseUrl(environment: ServerEnvironment = serverEnvironment()) {
  const value = environment.DATABASE_URL;
  if (!value && environment.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production");
  }
  const url = new URL(value ?? DEFAULT_DATABASE_URL);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use PostgreSQL");
  }
  return url.toString();
}

export function authDatabaseUrl(environment: ServerEnvironment = serverEnvironment()) {
  const url = new URL(databaseUrl(environment));
  url.searchParams.set("options", "-c search_path=auth");
  return url.toString();
}
