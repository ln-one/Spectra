const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const TOKEN_EXPIRY_KEY = "token_expiry";

export const AUTH_STATE_CHANGE_EVENT = "spectra:auth-state-changed";

function emitAuthStateChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_STATE_CHANGE_EVENT));
}

export const TokenStorage = {
  setAccessToken(token: string, expiresIn?: number): void {
    if (typeof window === "undefined") return;

    const maxAge = expiresIn || 86400;
    const cookieOptions = `path=/; max-age=${maxAge}; SameSite=Lax`;

    try {
      localStorage.setItem(ACCESS_TOKEN_KEY, token);
      document.cookie = `access_token=${token}; ${cookieOptions}`;

      if (expiresIn) {
        const expiryTime = Date.now() + expiresIn * 1000;
        localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiryTime));
      } else {
        localStorage.removeItem(TOKEN_EXPIRY_KEY);
      }
      emitAuthStateChange();
    } catch (error) {
      console.error("Failed to set access token:", error);
      try {
        document.cookie = `access_token=${token}; ${cookieOptions}`;
        emitAuthStateChange();
      } catch {
        localStorage.setItem(ACCESS_TOKEN_KEY, token);
        emitAuthStateChange();
      }
    }
  },

  getAccessToken(): string | null {
    if (typeof window === "undefined") return null;

    const tokenFromCookie = this.getAccessTokenFromCookie();
    if (tokenFromCookie) {
      return tokenFromCookie;
    }

    try {
      const expiryStr = localStorage.getItem(TOKEN_EXPIRY_KEY);
      if (expiryStr) {
        const expiryTime = parseInt(expiryStr, 10);
        if (Date.now() > expiryTime) {
          this.clearTokens();
          return null;
        }
      }
      return localStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  getAccessTokenFromCookie(): string | null {
    return this.getCookieValue(ACCESS_TOKEN_KEY);
  },

  getCookieValue(cookieName: string): string | null {
    if (typeof window === "undefined") return null;
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, ...valueParts] = cookie.trim().split("=");
      if (name === cookieName) {
        return valueParts.join("=") || null;
      }
    }
    return null;
  },

  setRefreshToken(token: string): void {
    if (typeof window === "undefined") return;
    const cookieOptions = "path=/; max-age=2592000; SameSite=Lax";
    try {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
      document.cookie = `${REFRESH_TOKEN_KEY}=${token}; ${cookieOptions}`;
      emitAuthStateChange();
    } catch (error) {
      console.error("Failed to set refresh token:", error);
      try {
        document.cookie = `${REFRESH_TOKEN_KEY}=${token}; ${cookieOptions}`;
        emitAuthStateChange();
      } catch {
        // no-op
      }
    }
  },

  getRefreshToken(): string | null {
    if (typeof window === "undefined") return null;
    try {
      const fromStorage = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (fromStorage) return fromStorage;
      return this.getCookieValue(REFRESH_TOKEN_KEY);
    } catch {
      return this.getCookieValue(REFRESH_TOKEN_KEY);
    }
  },

  updateToken(token: string): void {
    this.setAccessToken(token);
  },

  clearTokens(): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);

      document.cookie =
        "access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      document.cookie =
        "refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      emitAuthStateChange();
    } catch (error) {
      console.error("Failed to clear tokens:", error);
    }
  },

  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  },

  getTokenExpiry(): number | null {
    if (typeof window === "undefined") return null;
    const expiryStr = localStorage.getItem(TOKEN_EXPIRY_KEY);
    return expiryStr ? parseInt(expiryStr, 10) : null;
  },

  isTokenExpiringSoon(thresholdMs: number = 5 * 60 * 1000): boolean {
    const expiry = this.getTokenExpiry();
    if (!expiry) return true;
    return Date.now() + thresholdMs > expiry;
  },
};
