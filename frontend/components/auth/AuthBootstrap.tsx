"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { TokenStorage } from "@/lib/auth";

export function AuthBootstrap() {
  const { user, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    if (user || isLoading) return;
    if (!TokenStorage.getAccessToken()) return;
    void checkAuth();
  }, [checkAuth, isLoading, user]);

  return null;
}
