import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-2xl border border-border bg-surface p-5 shadow-lg shadow-black/20 ${className}`} {...props} />;
}
