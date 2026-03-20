import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authService, TokenStorage } from "@/lib/auth";

export function useWelcomePageState() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [showVideoModal, setShowVideoModal] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      let token = TokenStorage.getAccessToken();
      if (!token && TokenStorage.getRefreshToken()) {
        const refreshed = await authService.refreshToken();
        if (cancelled) return;
        if (refreshed) {
          token = TokenStorage.getAccessToken();
        }
      }

      if (token) {
        router.push("/projects");
        return;
      }

      const frame = requestAnimationFrame(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

      if (cancelled) {
        cancelAnimationFrame(frame);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return {
    isLoading,
    showVideoModal,
    openVideoModal: () => setShowVideoModal(true),
    closeVideoModal: () => setShowVideoModal(false),
  };
}
