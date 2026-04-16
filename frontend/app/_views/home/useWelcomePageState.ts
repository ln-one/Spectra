import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/lib/auth";

export function useWelcomePageState() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [showVideoModal, setShowVideoModal] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (await authService.hasActiveSession()) {
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
