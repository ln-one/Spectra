"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/authStore";
import { AUTH_STATE_CHANGE_EVENT } from "@/lib/auth";

export function AuthBootstrap() {
  const { isCheckingSession, checkAuth } = useAuthStore();
  const hasBootstrappedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (hasBootstrappedRef.current) return;
    hasBootstrappedRef.current = true;

    const bootstrap = async () => {
      if (!cancelled) {
        await checkAuth();
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [checkAuth]);

  useEffect(() => {
    const syncAuthState = () => {
      if (isCheckingSession) {
        return;
      }

      const sync = async () => {
        await checkAuth();
      };

      void sync();
    };

    window.addEventListener(AUTH_STATE_CHANGE_EVENT, syncAuthState);
    window.addEventListener("storage", syncAuthState);

    return () => {
      window.removeEventListener(AUTH_STATE_CHANGE_EVENT, syncAuthState);
      window.removeEventListener("storage", syncAuthState);
    };
  }, [checkAuth, isCheckingSession]);

  return null;
}
