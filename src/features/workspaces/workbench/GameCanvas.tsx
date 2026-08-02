"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { z } from "zod";
import type { gameSkinSchema } from "@/features/artifacts/games/contract";
import {
  createFlapRuntime,
  type FlapRuntime,
} from "@/features/artifacts/games/runtime/createFlapRuntime";

export type GameCanvasHandle = Pick<FlapRuntime, "flap" | "pause" | "resumeAfterRevival" | "start">;

export const GameCanvas = forwardRef<
  GameCanvasHandle,
  {
    onDeath: (summary: { elapsedMs: number; flapCount: number; score: number }) => void;
    onError: () => void;
    onPause: () => void;
    onReady: () => void;
    onScore: (score: number) => void;
    seed: string;
    skin: z.infer<typeof gameSkinSchema>;
  }
>(function GameCanvas({ onDeath, onError, onPause, onReady, onScore, seed, skin }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<FlapRuntime | null>(null);
  const callbacks = useRef({ onDeath, onError, onPause, onReady, onScore });
  callbacks.current = { onDeath, onError, onPause, onReady, onScore };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const runtime = createFlapRuntime(canvas, {
      onDeath: (summary) => callbacks.current.onDeath(summary),
      onPause: () => callbacks.current.onPause(),
      onScore: (score) => callbacks.current.onScore(score),
      seed,
      skin,
    });
    runtimeRef.current = runtime;
    runtime.ready.then(
      () => {
        if (runtimeRef.current === runtime) callbacks.current.onReady();
      },
      () => {
        if (runtimeRef.current === runtime) callbacks.current.onError();
      },
    );
    return () => {
      runtime.destroy();
      runtimeRef.current = null;
    };
  }, [seed, skin]);

  useImperativeHandle(
    ref,
    () => ({
      flap: () => runtimeRef.current?.flap(),
      pause: () => runtimeRef.current?.pause(),
      resumeAfterRevival: () => runtimeRef.current?.resumeAfterRevival(),
      start: () => runtimeRef.current?.start(),
    }),
    [],
  );

  return (
    <canvas
      ref={canvasRef}
      aria-label="飞跃复活游戏舞台"
      className="block h-full w-full touch-none bg-black object-contain [image-rendering:pixelated]"
    />
  );
});
