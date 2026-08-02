"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchWorkspaceConversationPage } from "./read-client";
import type { WorkspaceConversationNavigationItem } from "./types";

export function useWorkspaceConversationPages(input: {
  initialItems: readonly WorkspaceConversationNavigationItem[];
  initialNextCursor: string | null;
  workspaceId: string;
}) {
  return useInfiniteQuery({
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData: {
      pageParams: [null],
      pages: [{ items: [...input.initialItems], nextCursor: input.initialNextCursor }],
    },
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchWorkspaceConversationPage(input.workspaceId, pageParam),
    queryKey: ["workspace", input.workspaceId, "conversations"],
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
}
