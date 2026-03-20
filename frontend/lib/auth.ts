/**
 * @deprecated Prefer importing from "@/lib/auth" (resolved to this shim) or "@/lib/auth/*".
 * This file remains as a compatibility shim and re-exports from "./auth/*".
 */
export { AUTH_STATE_CHANGE_EVENT, TokenStorage } from "./auth/token-storage";
export { authService } from "./auth/service";
export type {
  AuthError,
  LoginResponse,
  RegisterRequest,
  User,
  ValidationError,
} from "./auth/types";
