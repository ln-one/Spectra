import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TokenStorage } from "@/lib/auth";

export function useWelcomePageState() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [showVideoModal, setShowVideoModal] = useState(false);

  useEffect(() => {
    const token = TokenStorage.getAccessToken();
    if (token) {
      router.push("/projects");
      return;
    }

    const frame = requestAnimationFrame(() => {
      setIsLoading(false);
    });

    return () => cancelAnimationFrame(frame);
  }, [router]);

  return {
    isLoading,
    showVideoModal,
    openVideoModal: () => setShowVideoModal(true),
    closeVideoModal: () => setShowVideoModal(false),
  };
}
