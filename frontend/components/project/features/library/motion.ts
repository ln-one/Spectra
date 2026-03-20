export const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const panelVariants = {
  hidden: { opacity: 0, x: 40, scale: 0.97 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 320,
      damping: 28,
      mass: 0.9,
    },
  },
  exit: {
    opacity: 0,
    x: 30,
    scale: 0.97,
    transition: { duration: 0.2, ease: "easeIn" as const },
  },
};
