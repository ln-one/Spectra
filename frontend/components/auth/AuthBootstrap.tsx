"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { AUTH_STATE_CHANGE_EVENT, TokenStorage } from "@/lib/auth";

export function AuthBootstrap() {
  const { user, isLoading, checkAuth, setUser } = useAuthStore();

  useEffect(() => {
    if (user || isLoading) return;
    if (!TokenStorage.getAccessToken()) return;
    void checkAuth();
  }, [checkAuth, isLoading, user]);

  useEffect(() => {
    const syncAuthState = () => {
      const token = TokenStorage.getAccessToken();
      if (!token) {
        setUser(null);
        return;
      }
      if (!user && !isLoading) {
        void checkAuth();
      }
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
