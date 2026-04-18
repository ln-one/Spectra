"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AnimationGraphRenderer } from "./graphRenderer";
import { compileAnimationComponent } from "./compiler";
import { PlaybackProvider } from "./runtimeApi";
import { isSandboxOutboundMessage, normalizeSandboxErrors } from "./sandboxProtocol";
import { compileRuntimeGraphToMotionCanvasScene } from "./motionCanvasManifest";
import { compileRuntimeGraphToTheatreState } from "./theatreState";
import type {
  AnimationArtifactRuntimeSnapshot,
  AnimationCompileError,
  AnimationExecutionState,
  AnimationRuntimeTheme,
  AnimationSandboxErrorEvent,
  AnimationSandboxOutboundMessage,
} from "./types";

class RuntimeErrorBoundary extends React.Component<
  React.PropsWithChildren<{ onError: (message: string) => void }>,
  { hasError: boolean }
> {
  constructor(props: React.PropsWithChildren<{ onError: (message: string) => void }>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message || "Unknown runtime error.");
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

interface SandboxShellProps {
  sessionToken: string;
  parentOrigin: string;
}

type SandboxState = {
  snapshot: AnimationArtifactRuntimeSnapshot | null;
  executionState: AnimationExecutionState | null;
  theme: AnimationRuntimeTheme | null;
};

type GraphRuntimeCompileResult =
  | {
      ok: true;
      theatreSequenceState: ReturnType<typeof compileRuntimeGraphToTheatreState>;
      motionCanvasSceneManifest: ReturnType<typeof compileRuntimeGraphToMotionCanvasScene>;
    }
  | {
      ok: false;
      errors: AnimationCompileError[];
    };

function missingComponentCodeResult() {
  return {
    ok: false as const,
    component: null,
    errors: [
      {
        message: "Runtime snapshot is missing component_code.",
        source: "schema" as const,
        ruleId: "missing-component-code",
      },
    ],
  };
}

function missingRuntimeGraphResult() {
  return {
    ok: false as const,
    errors: [
      {
        message: "Runtime snapshot is missing runtime_graph.",
        source: "schema" as const,
        ruleId: "missing-runtime-graph",
      },
    ],
  };
}

function postToParent(
  parentOrigin: string,
  payload:
    | { type: "animation-runtime:ready"; sessionToken: string }
    | AnimationSandboxErrorEvent
    | {
        type: "animation-runtime:telemetry";
        sessionToken: string;
        sequencePosition: number;
        stepIndex: number;
        totalSteps: number;
        currentSceneTitle?: string;
      }
) {
  if (typeof window === "undefined" || !window.parent) return;
  window.parent.postMessage(payload, parentOrigin || "*");
}

function mergeNextState(
  current: SandboxState,
  payload: AnimationSandboxOutboundMessage
): SandboxState {
  if (payload.type === "animation-runtime:init") {
    return {
      snapshot: payload.snapshot,
      executionState: payload.executionState,
      theme: payload.theme,
    };
  }
  return {
    snapshot: current.snapshot,
    executionState: payload.executionState,
    theme: payload.theme,
  };
}

export function SandboxShell({ sessionToken, parentOrigin }: SandboxShellProps) {
  const [state, setState] = useState<SandboxState>({
    snapshot: null,
    executionState: null,
    theme: null,
  });
  const [runtimeErrors, setRuntimeErrors] = useState<AnimationCompileError[]>([]);
  const runtimeGraph = state.snapshot?.runtimeGraph ?? null;

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== parentOrigin) return;
      if (!isSandboxOutboundMessage(event.data)) return;
      if (event.data.sessionToken !== sessionToken) return;
      setRuntimeErrors([]);
      setState((current) => mergeNextState(current, event.data));
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [parentOrigin, sessionToken]);

  useEffect(() => {
    postToParent(parentOrigin, {
      type: "animation-runtime:ready",
      sessionToken,
    });
  }, [parentOrigin, sessionToken]);

  const theatreSequenceState = useMemo(
    (): GraphRuntimeCompileResult | null => {
      if (!runtimeGraph) return null;
      try {
        return {
          ok: true,
          theatreSequenceState: compileRuntimeGraphToTheatreState(runtimeGraph),
          motionCanvasSceneManifest: compileRuntimeGraphToMotionCanvasScene(runtimeGraph),
        };
      } catch (error) {
        return {
          ok: false,
          errors: normalizeSandboxErrors([
            {
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to compile runtime_graph.",
              ruleId: "runtime-graph-compile-error",
              source: "schema",
            },
          ]),
        };
      }
    },
    [runtimeGraph]
  );
  const legacyCompileResult = runtimeGraph
    ? null
    : state.snapshot?.componentCode
      ? compileAnimationComponent(state.snapshot.componentCode, {
          expectedUsedPrimitives: state.snapshot.usedPrimitives,
        })
      : missingComponentCodeResult();

  useEffect(() => {
    if (!state.executionState) return;
    postToParent(parentOrigin, {
      type: "animation-runtime:telemetry",
      sessionToken,
      sequencePosition: state.executionState.sequencePosition,
      stepIndex: state.executionState.stepIndex,
      totalSteps: state.executionState.totalSteps,
      currentSceneTitle: state.executionState.currentSceneTitle,
    });
  }, [parentOrigin, sessionToken, state.executionState]);

  useEffect(() => {
    if (!state.snapshot) return;
    const runtimeGraphValidation = runtimeGraph
      ? theatreSequenceState?.ok === false
        ? theatreSequenceState
        : { ok: true as const }
      : missingRuntimeGraphResult();
    if (runtimeGraph && runtimeGraphValidation.ok) return;
    if (
      legacyCompileResult?.ok ||
      ("errors" in (legacyCompileResult ?? {}) &&
        (legacyCompileResult?.errors?.length ?? 0) === 0)
    ) {
      return;
    }
    const compileErrors = runtimeGraph
      ? runtimeGraphValidation.ok
        ? []
        : runtimeGraphValidation.errors
      : legacyCompileResult && "errors" in legacyCompileResult
        ? legacyCompileResult.errors
        : [];
    postToParent(parentOrigin, {
      type: "animation-runtime:compile-error",
      sessionToken,
      errors: compileErrors,
    });
  }, [
    legacyCompileResult,
    parentOrigin,
    sessionToken,
    state.snapshot,
    runtimeGraph,
    theatreSequenceState,
  ]);

  if (!state.snapshot || !state.executionState || !state.theme) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-white/70">
        Waiting for runtime payload...
      </main>
    );
  }

  if (runtimeGraph && theatreSequenceState?.ok) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <PlaybackProvider value={state.executionState}>
          <RuntimeErrorBoundary
            onError={(message) => {
              const errors = normalizeSandboxErrors([{ message }]);
              setRuntimeErrors(errors);
              postToParent(parentOrigin, {
                type: "animation-runtime:runtime-error",
                sessionToken,
                errors,
              });
            }}
          >
            <AnimationGraphRenderer
              graph={runtimeGraph}
              theme={state.theme}
              theatreSequenceState={theatreSequenceState.theatreSequenceState}
              motionCanvasSceneManifest={theatreSequenceState.motionCanvasSceneManifest}
            />
          </RuntimeErrorBoundary>
        </PlaybackProvider>
        {runtimeErrors.length > 0 ? (
          <div className="sr-only">{runtimeErrors[0]?.message}</div>
        ) : null}
      </main>
    );
  }

  if (!legacyCompileResult || !legacyCompileResult.ok || !legacyCompileResult.component) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-rose-200">
        Runtime compile error
      </main>
    );
  }

  const Component = legacyCompileResult.component;

  return (
    <main className="min-h-screen bg-zinc-950">
      <PlaybackProvider value={state.executionState}>
        <RuntimeErrorBoundary
          onError={(message) => {
            const errors = normalizeSandboxErrors([{ message }]);
            setRuntimeErrors(errors);
            postToParent(parentOrigin, {
              type: "animation-runtime:runtime-error",
              sessionToken,
              errors,
            });
          }}
        >
          <Component theme={state.theme} />
        </RuntimeErrorBoundary>
      </PlaybackProvider>
      {runtimeErrors.length > 0 ? (
        <div className="sr-only">{runtimeErrors[0]?.message}</div>
      ) : null}
    </main>
  );
}
