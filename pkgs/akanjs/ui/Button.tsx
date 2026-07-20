"use client";
import { clsx, usePage } from "akanjs/client";
import type React from "react";
import { type ButtonHTMLAttributes, type ComponentType, createElement, useState } from "react";
import { AiOutlineCheckCircle } from "react-icons/ai";

import { useUiOverride } from "./UiOverride";

export type ButtonProps<Result> = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  /** Async-aware click handler. Call onError to show the localized error state without throwing. */
  onClick: (
    e: React.MouseEvent<HTMLButtonElement>,
    { onError }: { onError: (error: string) => void },
  ) => Promise<Result> | Result;
  /** Called after the button briefly enters success state. */
  onSuccess?: (result: Result) => void;
};

const DefaultButton = <Result = unknown>({ className, children, onClick, onSuccess, ...rest }: ButtonProps<Result>) => {
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
        className={clsx("btn", className)}
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
            <span className="loading loading-bars loading-md" /> {l("base.processing")}
          </>
        ) : state.mode === "success" ? (
          <>
            <AiOutlineCheckCircle /> {l("base.processed")}
          </>
        ) : (
          children
        )}
      </button>
      {/* ? 이거 뭔지 */}
      {state.error ? (
        <div className="h-10 w-full p-2 text-center text-error text-sm">
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
