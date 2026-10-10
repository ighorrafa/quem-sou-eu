import type { ComponentPropsWithRef, ReactNode } from "react";

type FieldProps = {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
};

export function Field({ label, hint, error, children, htmlFor }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({ className = "", ...props }: ComponentPropsWithRef<"input">) {
  return (
    <input
      className={`h-11 w-full rounded-xl border border-border bg-background/60 px-3 text-base text-foreground placeholder:text-muted/70 focus:border-accent focus:outline-none ${className}`}
      {...props}
    />
  );
}
