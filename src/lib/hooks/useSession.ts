"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export type SessionState =
  | { status: "loading"; user: null }
  | { status: "needs_captcha"; user: null }
  | { status: "signing_in"; user: null }
  | { status: "signed_in"; user: User }
  | { status: "error"; user: null; message: string };

/**
 * Garante uma sessão anônima do Supabase. Se um site key do Turnstile estiver
 * configurado, o login só acontece após o componente de CAPTCHA entregar um token.
 */
function initClient(): { client: SupabaseClient | null; error: string | null } {
  // Criado apenas no navegador: evita exigir variáveis de ambiente no prerender.
  if (typeof window === "undefined") return { client: null, error: null };
  try {
    return { client: getSupabaseBrowserClient(), error: null };
  } catch (err) {
    return { client: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export function useSession() {
  const [{ client: supabase, error: initError }] = useState(initClient);
  const [state, setState] = useState<SessionState>(() =>
    initError ? { status: "error", user: null, message: initError } : { status: "loading", user: null },
  );
  const signingIn = useRef(false);

  const signInAnonymously = useCallback(
    async (captchaToken?: string) => {
      if (!supabase || signingIn.current) return;
      signingIn.current = true;
      setState({ status: "signing_in", user: null });
      const { data, error } = await supabase.auth.signInAnonymously(
        captchaToken ? { options: { captchaToken } } : undefined,
      );
      signingIn.current = false;
      if (error || !data.user) {
        setState({
          status: "error",
          user: null,
          message: error?.message ?? "Não foi possível iniciar a sessão.",
        });
        return;
      }
      setState({ status: "signed_in", user: data.user });
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    const applySession = (session: Session | null) => {
      if (cancelled) return;
      if (session?.user) {
        setState({ status: "signed_in", user: session.user });
      } else if (TURNSTILE_SITE_KEY) {
        setState({ status: "needs_captcha", user: null });
      } else {
        void signInAnonymously();
      }
    };

    supabase.auth.getSession().then(({ data }) => applySession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        applySession(null);
      } else if (session?.user) {
        setState({ status: "signed_in", user: session.user });
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [supabase, signInAnonymously]);

  return { supabase, session: state, signInAnonymously };
}
