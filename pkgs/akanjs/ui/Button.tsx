"use client";
import { usePage } from "akanjs/client";
import type React from "react";
import { type ButtonHTMLAttributes, type ComponentType, createElement, useState } from "react";
import { AiOutlineCheckCircle, AiOutlineLoading3Quarters } from "react-icons/ai";
import { type ButtonVariants, buttonRecipe } from "./recipe";
import { useUiOverride, useUiRecipe } from "./UiOverride";

// buttonRecipe/ButtonVariants live in the server-safe ./recipe layer (no "use client") so server
// components can compose classNames. Re-exported here so `from "./Button"` relative importers keep resolving.
export { buttonRecipe, type ButtonVariants };

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
  // Route-scoped look swap (recipe slot). Behavior below is untouched by a swap.
  const recipe = useUiRecipe("button") ?? buttonRecipe;
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
        className={recipe({ variant, size }, className)}
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
