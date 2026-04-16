/**
 * useGenerationEvents — SSE 事件流消费 Hook
 *
 * 基于 EventSource 消费生成会话的实时事件流，
 * 支持断线重连、cursor 断点续传、auth token 过期处理。
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { generateApi } from "@/lib/sdk/generate";
import type { GenerationEvent } from "@/lib/sdk/generate";

export interface UseGenerationEventsOptions {
  /** 会话 ID，为空时不连接 */
  sessionId: string | null;
  /** 事件回调 */
  onEvent?: (event: GenerationEvent) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** 连接打开回调 */
  onOpen?: () => void;
  /** 连接关闭回调 */
  onClose?: () => void;
  /** 是否启用自动重连，默认 true */
  autoReconnect?: boolean;
  /** 最大重连次数，默认 5 */
  maxRetries?: number;
}

export interface UseGenerationEventsReturn {
  /** 当前是否已连接 */
  isConnected: boolean;
  /** 已接收的事件列表 */
  events: GenerationEvent[];
  /** 最近一次错误 */
  error: Error | null;
  /** 手动断开 */
  disconnect: () => void;
  /** 手动重连 */
  reconnect: () => void;
}

export function useGenerationEvents(
  options: UseGenerationEventsOptions
): UseGenerationEventsReturn {
  const {
    sessionId,
    onEvent,
    onError,
    onOpen,
    onClose,
    autoReconnect = true,
    maxRetries = 5,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<GenerationEvent[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const cursorRef = useRef<string | undefined>(undefined);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => void>(() => {});

  // 使用 ref 保存回调，避免重连时的闭包陈旧问题
  const onEventRef = useRef(onEvent);
  const onErrorRef = useRef(onError);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onEventRef.current = onEvent;
    onErrorRef.current = onError;
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
  }, [onClose, onError, onEvent, onOpen]);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
    setError(null);
  }, []);

  const connect = useCallback(() => {
    if (!sessionId) return;

    cleanup();
    setError(null);

    const url = generateApi.getEventStream(sessionId, cursorRef.current);
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      setError(null);
      retriesRef.current = 0;
      onOpenRef.current?.();
    };

    es.onmessage = (event) => {
      try {
        const parsed: GenerationEvent = JSON.parse(event.data);
        setEvents((prev) => [...prev, parsed]);
        onEventRef.current?.(parsed);

        // 保存 cursor 用于断线续传
        if (parsed.cursor) {
          cursorRef.current = parsed.cursor;
        }
      } catch (err) {
        console.error("[SSE] Failed to parse event data:", err);
      }
    };

    es.onerror = () => {
      es.close();
      setIsConnected(false);
      onCloseRef.current?.();

      // 自动重连（指数退避）
      if (autoReconnect && retriesRef.current < maxRetries) {
        const delay = Math.min(1000 * 2 ** retriesRef.current, 30000);
        retriesRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          connectRef.current();
        }, delay);
        return;
      }

      const err = new Error("SSE connection lost");
      setError(err);
      onErrorRef.current?.(err);
    };
  }, [sessionId, autoReconnect, maxRetries, cleanup]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    retriesRef.current = maxRetries; // 阻止自动重连
    cleanup();
    onCloseRef.current?.();
  }, [cleanup, maxRetries]);

  const reconnect = useCallback(() => {
    retriesRef.current = 0;
    connect();
  }, [connect]);

  // sessionId 变化时自动连接/断开
  useEffect(() => {
    if (sessionId) {
      cursorRef.current = undefined; // 新会话重置 cursor
      const frame = requestAnimationFrame(() => {
        setEvents([]);
        connect();
      });
      return () => {
        cancelAnimationFrame(frame);
        cleanup();
      };
    } else {
      const frame = requestAnimationFrame(() => {
        cleanup();
      });
      return () => {
        cancelAnimationFrame(frame);
        cleanup();
      };
    }

    return cleanup;
  }, [sessionId, connect, cleanup]);

  return { isConnected, events, error, disconnect, reconnect };
}
