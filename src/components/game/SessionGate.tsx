"use client";

import { useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Turnstile } from "@/components/Turnstile";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TURNSTILE_SITE_KEY, useSession } from "@/lib/hooks/useSession";

type SessionGateProps = {
  children: (ctx: { supabase: SupabaseClient; user: User }) => ReactNode;
};

/**
 * Renderiza os filhos somente com uma sessão anônima ativa. Exibe o CAPTCHA
 * quando configurado e trata erros de autenticação.
 */
export function SessionGate({ children }: SessionGateProps) {
  const { supabase, session, signInAnonymously } = useSession();
  const [captchaError, setCaptchaError] = useState<string | null>(null);

  if (session.status === "signed_in" && supabase) {
    return <>{children({ supabase, user: session.user })}</>;
  }

  if (session.status === "needs_captcha") {
    return (
      <Card className="mx-auto w-full max-w-md space-y-4 text-center">
        <h2 className="text-lg font-semibold">Verificação rápida</h2>
        <p className="text-sm text-muted">Confirme que você não é um robô para entrar no jogo.</p>
        <div className="flex justify-center">
          <Turnstile
            siteKey={TURNSTILE_SITE_KEY}
            onToken={(token) => {
              setCaptchaError(null);
              void signInAnonymously(token);
            }}
            onError={setCaptchaError}
          />
        </div>
        {captchaError && <Alert tone="error">{captchaError}</Alert>}
      </Card>
    );
  }

  if (session.status === "error") {
    return (
      <Card className="mx-auto w-full max-w-md space-y-4 text-center">
        <Alert tone="error">{session.message}</Alert>
        <Button variant="secondary" onClick={() => void signInAnonymously()}>
          Tentar novamente
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted">
      <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      Preparando sua sessão...
    </div>
  );
}
