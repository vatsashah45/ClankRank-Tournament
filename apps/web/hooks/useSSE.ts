"use client";

import { useEffect, useRef, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface SSEMatchStartedData {
  matchId: number;
  round: string;
  region: string | null;
  entryAId: number;
  entryBId: number;
  startedAt: string;
}

export interface SSEMatchCompletedData {
  matchId: number;
  round: string;
  region: string | null;
  winnerId: number;
  scoreA: number;
  scoreB: number;
  completedAt: string;
}

export interface SSEStateAdvancedData {
  state: string;
}

export interface SSERoundCompletedData {
  round: string;
}

export interface UseSSEOptions {
  onMatchStarted?: (data: SSEMatchStartedData) => void;
  onMatchCompleted?: (data: SSEMatchCompletedData) => void;
  onStateAdvanced?: (data: SSEStateAdvancedData) => void;
  onRoundCompleted?: (data: SSERoundCompletedData) => void;
  onReconnect?: () => void;
}

/**
 * Hook that manages an EventSource connection to /api/bracket/events.
 * Auto-reconnects on error. On reconnect, calls onReconnect to resync state.
 * Satisfies SYS-RES-7.
 */
export function useSSE(options: UseSSEOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(3000);
  const sourceRef = useRef<EventSource | null>(null);
  const isFirstConnect = useRef(true);

  const connect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }

    const es = new EventSource(`${API_URL}/api/bracket/events`);
    sourceRef.current = es;

    es.addEventListener("match:started", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SSEMatchStartedData;
        optionsRef.current.onMatchStarted?.(data);
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener("match:completed", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SSEMatchCompletedData;
        optionsRef.current.onMatchCompleted?.(data);
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener("state:advanced", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SSEStateAdvancedData;
        optionsRef.current.onStateAdvanced?.(data);
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener("round:completed", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SSERoundCompletedData;
        optionsRef.current.onRoundCompleted?.(data);
      } catch {
        // ignore parse errors
      }
    });

    es.onerror = () => {
      es.close();
      sourceRef.current = null;
      // On reconnect (after first connect), trigger a state resync
      if (!isFirstConnect.current) {
        optionsRef.current.onReconnect?.();
      }
      isFirstConnect.current = false;
      // Clear any existing timer before scheduling a new one
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      // Reconnect with exponential backoff + jitter
      const jitter = Math.floor(Math.random() * 1000);
      reconnectTimer.current = setTimeout(() => {
        connect();
      }, reconnectDelay.current + jitter);
      reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
    };

    es.onopen = () => {
      // Reset backoff on successful connection
      reconnectDelay.current = 3000;
      if (!isFirstConnect.current) {
        // Reconnected — trigger full state sync
        optionsRef.current.onReconnect?.();
      }
      isFirstConnect.current = false;
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
  }, [connect]);
}
