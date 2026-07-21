"use client";
import { cn, usePage } from "akanjs/client";
import { cva, type VariantProps } from "class-variance-authority";
import type React from "react";
import { type ButtonHTMLAttributes, type ComponentType, createElement, useState } from "react";
import { AiOutlineCheckCircle, AiOutlineLoading3Quarters } from "react-icons/ai";

import { useUiOverride } from "./UiOverride";

/**
 * Canonical cva pattern for Akan primitives: a `*Variants` factory drives the
 * base + variant classes, `cn(...)` merges the caller's className last (so it
 * can override), and semantic tokens (bg-primary/text-primary-foreground/…)
 * keep theming automatic. Other primitives should follow this shape.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-field font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-input bg-background hover:bg-muted hover:text-foreground",
        ghost: "hover:bg-muted hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

export type ButtonProps<Result> = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> &
  ButtonVariants & {
    /** Async-aware click handler. Call onError to show the localized error state without throwing. */
    onClick: (
      e: React.MouseEvent<HTMLButtonElement>,
      { onError }: { onError: (error: string) => void },
    ) => Promise<Result> | Result;
    /** Called after the button briefly enters success state. */
    onSuccess?: (result: Result) => void;
  };

const DefaultButton = <Result = unknown>({
  className,
  variant,
  size,
  children,
  onClick,
  onSuccess,
  ...rest
}: ButtonProps<Result>) => {
  const { l } = usePage();
  const [state, setState] = useState<{
    mode: "idle" | "loading" | "success" | "error";
    error: string | null;
    times: number;
  }>({
    mode: "idle",
    error: null,
    times: 0,
  });
  return (
    <>
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        {...rest}
        disabled={!!rest.disabled || ["loading", "success"].includes(state.mode)}
        onClick={(e) => {
          setState({ mode: "loading", error: null, times: state.times + 1 });
          void (async () => {
            const result = await onClick(e, {
              onError: (error) => {
                setState({ mode: "error", error, times: state.times + 1 });
              },
            });
            setState({ mode: "success", error: null, times: state.times + 1 });
            setTimeout(() => {
              setState({ mode: "idle", error: null, times: state.times + 1 });
              onSuccess?.(result);
            }, 300);
          })();
        }}
      >
        {state.mode === "loading" ? (
          <>
            <AiOutlineLoading3Quarters className="animate-spin" /> {l("base.processing")}
          </>
        ) : state.mode === "success" ? (
          <>
            <AiOutlineCheckCircle /> {l("base.processed")}
          </>
        ) : (
          children
        )}
      </button>
      {state.error ? (
        <div className="h-10 w-full p-2 text-center text-destructive text-sm">
          {state.error ? l(state.error as "base.error") : "  "}
        </div>
      ) : null}
    </>
  );
};

/**
 * Async-aware button. Resolves to a route-scoped override when a `page/**\/_overrides.tsx`
 * in the route's ancestry declares one, otherwise renders {@link DefaultButton}. The public
 * generic signature is preserved, so `<Button<Todo> onSuccess={(r: Todo) => …} />` still infers.
 */
export const Button = <Result = unknown>(props: ButtonProps<Result>) => {
  const Override = useUiOverride("Button");
  const Impl = (Override ?? DefaultButton) as unknown as ComponentType<ButtonProps<Result>>;
  return createElement(Impl, props);
};
