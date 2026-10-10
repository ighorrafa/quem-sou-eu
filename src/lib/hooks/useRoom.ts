"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createSignedImageUrls, fetchRoomSnapshot, SIGNED_URL_TTL_SECONDS } from "@/lib/game/api";
import type { RoomSnapshot } from "@/lib/game/types";

const POLL_INTERVAL_MS = 15_000;
const REFRESH_DEBOUNCE_MS = 150;
const SIGNED_URL_REFRESH_MS = (SIGNED_URL_TTL_SECONDS - 300) * 1000;

export type ConnectionStatus = "connecting" | "live" | "polling" | "offline";

export type UseRoomResult = {
  snapshot: RoomSnapshot | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  connection: ConnectionStatus;
  imageUrls: Record<string, string>;
  refresh: () => Promise<void>;
};

/**
 * Mantém o estado da sala sincronizado: carrega o snapshot permitido pelo RLS,
 * assina mudanças via Realtime, e cai para polling quando o canal falha.
 * Qualquer evento dispara um refetch completo (visão filtrada pelo banco).
 */
export function useRoom(supabase: SupabaseClient, roomId: string | null, enabled: boolean): UseRoomResult {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const urlIssuedAt = useRef<Record<string, number>>({});
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const refreshAgain = useRef(false);

  const refresh = useCallback(async () => {
    if (!roomId || !enabled) return;
    if (inFlight.current) {
      // Mudança chegou durante uma consulta: garante mais uma rodada ao final.
      refreshAgain.current = true;
      return inFlight.current;
    }
    const task = (async () => {
      do {
        refreshAgain.current = false;
        try {
          const next = await fetchRoomSnapshot(supabase, roomId);
          if (!next) {
            setNotFound(true);
            setSnapshot(null);
          } else {
            setNotFound(false);
            setSnapshot(next);
            setError(null);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Falha ao carregar a sala.");
        } finally {
          setLoading(false);
        }
      } while (refreshAgain.current);
    })();
    inFlight.current = task;
    try {
      await task;
    } finally {
      inFlight.current = null;
    }
  }, [supabase, roomId, enabled]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  // Carga inicial + Realtime + polling de segurança.
  useEffect(() => {
    if (!roomId || !enabled) return;
    let channel: RealtimeChannel | null = null;
    let disposed = false;

    void refresh();

    channel = supabase
      .channel(`room:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments", filter: `room_id=eq.${roomId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "turn_events", filter: `room_id=eq.${roomId}` }, scheduleRefresh)
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          setConnection("live");
          scheduleRefresh();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnection("polling");
        } else if (status === "CLOSED") {
          setConnection((prev) => (prev === "live" ? "polling" : prev));
        }
      });

    const poll = setInterval(() => void refresh(), POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onOnline = () => {
      setConnection("connecting");
      void refresh();
    };
    const onOffline = () => setConnection("offline");
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      disposed = true;
      clearInterval(poll);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, roomId, enabled, refresh, scheduleRefresh]);

  // URLs assinadas das imagens visíveis; renova antes de expirar.
  const visiblePaths = useMemo(() => (snapshot ? snapshot.cards.map((c) => c.image_path) : []), [snapshot]);
  const visiblePathsKey = visiblePaths.join("|");

  useEffect(() => {
    if (!enabled || visiblePaths.length === 0) return;
    let cancelled = false;
    const now = Date.now();
    const missing = visiblePaths.filter((path) => {
      const issued = urlIssuedAt.current[path];
      return !issued || now - issued > SIGNED_URL_REFRESH_MS;
    });
    if (missing.length === 0) return;

    createSignedImageUrls(supabase, missing)
      .then((urls) => {
        if (cancelled) return;
        const issuedAt = Date.now();
        for (const path of Object.keys(urls)) urlIssuedAt.current[path] = issuedAt;
        setImageUrls((prev) => ({ ...prev, ...urls }));
      })
      .catch(() => {
        // Falha transitória: a próxima atualização tenta novamente.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, enabled, visiblePathsKey]);

  return { snapshot, loading, error, notFound, connection, imageUrls, refresh };
}
