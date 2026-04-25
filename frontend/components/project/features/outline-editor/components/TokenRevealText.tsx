"use client";

import { useEffect, useState } from "react";

interface TokenRevealTextProps {
  text: string;
  animate: boolean;
}

export function TokenRevealText({ text, animate }: TokenRevealTextProps) {
  const [visibleCount, setVisibleCount] = useState(
    animate ? 0 : text.length || 0
  );

  useEffect(() => {
    if (!animate) {
      setVisibleCount(text.length);
      return;
    }
    if (!text) {
      setVisibleCount(0);
      return;
    }
    setVisibleCount((prev) => Math.min(prev, text.length));
    let cancelled = false;
    const timer = window.setInterval(() => {
      if (cancelled) return;
      setVisibleCount((prev) => {
        if (prev >= text.length) {
          window.clearInterval(timer);
          return text.length;
        }
        return Math.min(text.length, prev + 2);
      });
    }, 16);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [animate, text]);

  const visibleText = text.slice(0, visibleCount);
  const showCursor = animate && visibleCount < text.length;
  return (
    <span className="whitespace-pre-wrap break-words leading-relaxed">
      {visibleText}
      {showCursor ? (
        <span className="ml-0.5 inline-block h-[1em] w-[0.45ch] animate-pulse bg-current align-[-0.15em]" />
      ) : null}
    </span>
  );
}
