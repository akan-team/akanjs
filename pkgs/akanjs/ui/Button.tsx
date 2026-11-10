"use client";
import { cn, usePage } from "akanjs/client";
import { isThenable } from "akanjs/common";
import type React from "react";
import { type ButtonHTMLAttributes, type ComponentType, createElement, useState } from "react";
import { agentAttrs } from "./agentAttrs";
import { Icon } from "./Icon";
import { type ButtonVariants, buttonRecipe } from "./recipe";
import { useUiOverride, useUiRecipe } from "./UiOverride";

export { type ButtonVariants, buttonRecipe };

export type ButtonProps<Result> = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> &
  ButtonVariants & {
    /** Returning a promise opts into the pending/success states; `onError` shows a localized error without throwing. */
    onClick?: (
      e: React.MouseEvent<HTMLButtonElement>,
      { onError }: { onError: (error: string) => void },
    ) => Promise<Result> | Result;
    /** Called after the brief success state. */
    onSuccess?: (result: Result) => void;
    /** `hold` (default) fades a bare indicator over the children; `replace` cross-fades to a labelled one and sizes
     *  the box to the wider label. Either way the box never resizes. */
    loadingMode?: "hold" | "replace";
    /** Whether a message passed to `onError` renders under the button. A thrown error is left to its thrower. */
    showError?: boolean;
  };

// A solid `currentColor` disc with the tick punched out, so it takes the variant's own foreground/background pair:
// any fixed token vanishes on some variant, and a tinted halo lowered the tick's contrast.
const successIconClass = "animate-checkIn text-[1.15em]";

// Must outlast the 340ms `checkIn` entrance, or a completed action reads as "nothing happened".
const successDwellMs = 700;

const DefaultButton = <Result = unknown>({
  className,
  variant,
  size,
  shape,
  outline,
  type = "button",
  loadingMode = "hold",
  showError = true,
  children,
  onClick,
  onSuccess,
  ...rest
}: ButtonProps<Result>) => {
  const { l } = usePage();
  const recipe = useUiRecipe("button") ?? buttonRecipe;
  // `shown` is tracked apart from `mode`: the overlay fades on opacity, and deriving it flashed the spinner after success.
  const [state, setState] = useState<{
    mode: "idle" | "loading" | "success" | "error";
    error: string | null;
    shown: "loading" | "success";
  }>({ mode: "idle", error: null, shown: "loading" });
  const busy = state.mode === "loading" || state.mode === "success";
  return (
    <>
      <button
        type={type}
        className={recipe(
          { variant, size, shape, outline },
          // `relative` stays out of the recipe (raw `buttonRecipe()` calls need none); busy disables only to
          // swallow clicks, so the recipe's dim is cancelled unless the caller disabled it.
          cn(loadingMode === "hold" && "relative", busy && !rest.disabled && "disabled:opacity-100", className),
        )}
        {...rest}
        {...agentAttrs(onClick)}
        disabled={!!rest.disabled || busy}
        onClick={(e) => {
          if (!onClick) return;
          let errored = false;
          const result = onClick(e, {
            onError: (error) => {
              errored = true;
              setState((s) => ({ ...s, mode: "error", error }));
            },
          });
          if (!isThenable(result)) return;
          if (!errored) setState({ mode: "loading", error: null, shown: "loading" });
          void (async () => {
            try {
              const awaited = (await result) as Result;
              if (errored) return;
              setState({ mode: "success", error: null, shown: "success" });
              setTimeout(() => {
                // Spread so `shown` survives: the overlay keeps the check while it fades out.
                setState((s) => ({ ...s, mode: "idle", error: null }));
                onSuccess?.(awaited);
              }, successDwellMs);
            } catch {
              if (errored) return;
              // The thrower already surfaced the error; `shown` stays "loading" so a failure never flashes a check.
              setState((s) => ({ ...s, mode: "idle", error: null }));
            }
          })();
        }}
      >
        {loadingMode === "replace" ? (
          // One grid cell for both labels fixes the box at the wider one; `place-items-center` keeps the narrower centred.
          <span className="grid place-items-center">
            <span
              className={cn(
                "col-start-1 row-start-1 flex items-center gap-2 transition-opacity duration-200",
                busy && "opacity-0",
              )}
            >
              {children}
            </span>
            <span
              aria-hidden={!busy}
              className={cn(
                "col-start-1 row-start-1 flex items-center gap-2 transition-opacity duration-200",
                busy ? "opacity-100" : "opacity-0",
              )}
            >
              {state.shown === "success" ? (
                <>
                  <Icon.CheckCircleFill className={successIconClass} /> {l("base.processed")}
                </>
              ) : (
                <>
                  <Icon.Loading className="animate-spin" /> {l("base.processing")}
                </>
              )}
            </span>
          </span>
        ) : (
          <>
            {/* Children keep their box while hidden, so the button's measured size never changes. */}
            <span className={cn("inline-flex items-center gap-2 transition-opacity duration-200", busy && "opacity-0")}>
              {children}
            </span>
            <span
              aria-hidden={!busy}
              className={cn(
                "absolute inset-0 flex items-center justify-center transition-opacity duration-200",
                busy ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              {state.shown === "success" ? (
                <Icon.CheckCircleFill className={successIconClass} />
              ) : (
                <Icon.Loading className="animate-spin" />
              )}
            </span>
          </>
        )}
      </button>
      {showError && state.error ? (
        <span role="alert" className="mt-1 block text-center text-destructive text-xs">
          {l(state.error as "base.error")}
        </span>
      ) : null}
    </>
  );
};

/** A promise returned from `onClick` shows a pending indicator, then a brief success state. */
export const Button = <Result = unknown>(props: ButtonProps<Result>) => {
  const Override = useUiOverride("Button");
  const Impl = (Override ?? DefaultButton) as unknown as ComponentType<ButtonProps<Result>>;
  return createElement(Impl, props);
};
