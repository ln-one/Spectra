import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

export function isSignUpEnabled(environment: ServerEnvironment = serverEnvironment()) {
  return environment.NODE_ENV === "development";
}
