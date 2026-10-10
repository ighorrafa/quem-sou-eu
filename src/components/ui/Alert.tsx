import type { ReactNode } from "react";

type Tone = "info" | "error" | "success" | "warning";

const tones: Record<Tone, string> = {
  info: "border-border bg-surface text-foreground",
  error: "border-danger/50 bg-danger/10 text-danger",
  success: "border-success/50 bg-success/10 text-success",
  warning: "border-accent/50 bg-accent/10 text-accent-strong",
};

export function Alert({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
