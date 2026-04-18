import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/lib/auth";

const SESSION_CHECK_TIMEOUT_MS = 8_000;

export function useWelcomePageState() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [showVideoModal, setShowVideoModal] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const hasSession = await authService.hasActiveSession({
        timeoutMs: SESSION_CHECK_TIMEOUT_MS,
      });
      if (cancelled) return;
      if (hasSession) {
        router.replace("/projects");
        return;
      }
      setIsLoading(false);
    };

    void bootstrap().catch(() => {
      if (!cancelled) {
        setIsLoading(false);
      }
    });
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
