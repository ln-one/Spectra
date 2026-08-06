import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

export function isSignUpEnabled(environment: ServerEnvironment = serverEnvironment()) {
  return environment.NODE_ENV === "development" || environment.AUTH_SIGN_UP_ENABLED === true;
}
