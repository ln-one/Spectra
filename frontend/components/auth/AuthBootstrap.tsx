"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { AUTH_STATE_CHANGE_EVENT, authService, TokenStorage } from "@/lib/auth";

export function AuthBootstrap() {
  const { user, isLoading, checkAuth, setUser } = useAuthStore();

  useEffect(() => {
    let cancelled = false;
    if (user || isLoading) return;

    const bootstrap = async () => {
      let token = TokenStorage.getAccessToken();
      if (!token && TokenStorage.getRefreshToken()) {
        const refreshed = await authService.refreshToken();
        if (!refreshed || cancelled) return;
        token = TokenStorage.getAccessToken();
      }
      if (token && !cancelled) {
        await checkAuth();
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [checkAuth, isLoading, user]);

  useEffect(() => {
    const syncAuthState = () => {
      const sync = async () => {
        let token = TokenStorage.getAccessToken();
        if (!token && TokenStorage.getRefreshToken()) {
          const refreshed = await authService.refreshToken();
          if (refreshed) {
            token = TokenStorage.getAccessToken();
          }
        }
        if (!token) {
          setUser(null);
          return;
        }
        if (!user && !isLoading) {
          await checkAuth();
        }
      };

      void sync();
    };

    window.addEventListener(AUTH_STATE_CHANGE_EVENT, syncAuthState);
    window.addEventListener("storage", syncAuthState);

    return () => {
      window.removeEventListener(AUTH_STATE_CHANGE_EVENT, syncAuthState);
      window.removeEventListener("storage", syncAuthState);
    };
  }, [checkAuth, isLoading, setUser, user]);

  return null;
}
