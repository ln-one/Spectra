"use client";

import { VideoModal } from "./VideoModal";
import { useWelcomePageState } from "./useWelcomePageState";
import {
  CTASection,
  FeaturesSection,
  Footer,
  HeroSection,
  LoadingState,
  Navbar,
  StatsSection,
  TestimonialsSection,
  WorkflowSection,
} from "./sections";

export default function WelcomePage() {
  const { isLoading, showVideoModal, openVideoModal, closeVideoModal } =
    useWelcomePageState();

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection onShowVideo={openVideoModal} />
      <StatsSection />
      <FeaturesSection />
      <WorkflowSection />
      <TestimonialsSection />
      <CTASection onShowVideo={openVideoModal} />
      <Footer />

      <VideoModal open={showVideoModal} onClose={closeVideoModal} />
    </div>
  );
}
