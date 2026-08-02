import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { useArtifactSuggestions } from "./useArtifactSuggestions";

afterEach(() => {
  vi.useRealTimers();
});

test("polls without re-enqueueing and stops after the bounded wait", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-20T00:00:00.000Z"));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetchSuggestions = vi.fn().mockResolvedValue({
    generation: null,
    status: "pending" as const,
    suggestions: [],
  });
  const regenerateSuggestions = vi.fn().mockResolvedValue({
    generation: null,
    status: "pending" as const,
    suggestions: [],
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const { result, unmount } = renderHook(
    () =>
      useArtifactSuggestions({
        enabled: true,
        fetchSuggestions,
        queryKey: ["suggestions", "quiz"],
        regenerateSuggestions,
      }),
    { wrapper },
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(fetchSuggestions).toHaveBeenNthCalledWith(1, undefined, false);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(121_000);
  });
  expect(fetchSuggestions.mock.calls.slice(1).every((call) => call[1] === true)).toBe(true);
  expect(result.current.error).toBe(true);
  expect(result.current.loading).toBe(false);
  expect(result.current.refreshing).toBe(false);

  await act(async () => {
    result.current.retry();
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(regenerateSuggestions).toHaveBeenCalledTimes(1);
  unmount();
  queryClient.clear();
});

test("keeps a stale snapshot and does not restart generation after timeout", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-20T00:00:00.000Z"));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const suggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `Prompt ${index}`,
    title: `Suggestion ${index}`,
  }));
  const fetchSuggestions = vi
    .fn()
    .mockResolvedValueOnce({
      generation: "2026-07-19T00:00:00.000Z",
      status: "stale" as const,
      suggestions,
    })
    .mockResolvedValue({
      generation: "2026-07-19T00:00:00.000Z",
      status: "pending" as const,
      suggestions: [],
    });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const { result, unmount } = renderHook(
    () =>
      useArtifactSuggestions({
        enabled: true,
        fetchSuggestions,
        queryKey: ["suggestions", "stale-quiz"],
        regenerateSuggestions: vi.fn(),
      }),
    { wrapper },
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(121_000);
  });
  expect(result.current.error).toBe(true);
  expect(result.current.suggestions).toEqual(suggestions);
  const callsAtTimeout = fetchSuggestions.mock.calls.length;

  await act(async () => {
    await vi.advanceTimersByTimeAsync(120_000);
  });
  expect(fetchSuggestions).toHaveBeenCalledTimes(callsAtTimeout);
  unmount();
  queryClient.clear();
});

test("garbage collects inactive suggestions after the bounded retention", async () => {
  vi.useFakeTimers();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const queryKey = ["suggestions", "bounded-gc"];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const { unmount } = renderHook(
    () =>
      useArtifactSuggestions({
        enabled: true,
        fetchSuggestions: vi.fn().mockResolvedValue({
          generation: "generation-1",
          status: "fresh" as const,
          suggestions: [],
        }),
        queryKey,
        regenerateSuggestions: vi.fn(),
      }),
    { wrapper },
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  unmount();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(15 * 60 * 1_000 - 1);
  });
  expect(queryClient.getQueryCache().find({ queryKey })).toBeDefined();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(queryClient.getQueryCache().find({ queryKey })).toBeUndefined();
  queryClient.clear();
});
