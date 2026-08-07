"use client";
import { cn, usePage } from "akanjs/client";
import { isThenable } from "akanjs/common";
import type React from "react";
import { type ButtonHTMLAttributes, type ComponentType, createElement, useState } from "react";
import { AiFillCheckCircle, AiOutlineLoading3Quarters } from "react-icons/ai";
import { type ButtonVariants, buttonRecipe } from "./recipe";
import { useUiOverride, useUiRecipe } from "./UiOverride";

// buttonRecipe/ButtonVariants live in the server-safe ./recipe layer (no "use client") so server
// components can compose classNames. Re-exported here so `from "./Button"` relative importers keep resolving.
export { buttonRecipe, type ButtonVariants };

export type ButtonProps<Result> = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> &
  ButtonVariants & {
    /**
     * Click handler. Returning a promise is what opts this button into the async states — a plain
     * synchronous handler renders as an ordinary button with no spinner. Call onError to show the
     * localized error state without throwing.
     */
    onClick?: (
      e: React.MouseEvent<HTMLButtonElement>,
      { onError }: { onError: (error: string) => void },
    ) => Promise<Result> | Result;
    /** Called after the button briefly enters success state. */
    onSuccess?: (result: Result) => void;
    /**
     * How the pending/success indicator is drawn. Both modes keep the button's box fixed — CSS cannot
     * animate an auto width, so a resizing button can only ever snap.
     *
     * `hold` (default) fades a bare indicator over the children, so the box stays exactly the children's
     * size. `replace` cross-fades to a labelled indicator ("Processing…"); both labels stay stacked in the
     * DOM, so the box is the wider of the two from the start and still never moves — at the cost of an idle
     * button that is as wide as its longest state.
     */
    loadingMode?: "hold" | "replace";
    /** Whether a failed action renders its message under the button. Off leaves it to the framework toast. */
    showError?: boolean;
  };

/**
 * Success mark, entering with `checkIn` (akanjs/ui/styles.css — a 340ms fade plus a 6% overshoot; `pop`'s 1.5x
 * overshoot from zero reads as cartoonish on a glyph this small).
 *
 * The colour is derived from the button, never named — any fixed token fails somewhere: `text-success` vanishes
 * on a `success` button, and a `bg-success` disc lands an unrelated hue on every other fill.
 *
 * `AiFillCheckCircle` is a solid disc with the tick punched out, which is why it is used instead of an outline
 * glyph plus a tinted halo. The disc is `currentColor` (the button's foreground) and the tick is the fill
 * showing through, so the mark reuses the variant's own foreground/background pair — already contrast-checked
 * by themeValidator — at full strength. An earlier attempt put an outline tick on a low-alpha current-colour
 * halo, which did the opposite: tinting the local background toward the glyph's own colour *lowered* the
 * contrast that made the tick readable. (Do not name the class here — Tailwind's source scanner reads comments
 * too, so a class literal in prose compiles to a dead rule.)
 *
 * Sizing is in `em`, so one class covers `xs` through `lg`.
 */
const successIconClass = "animate-checkIn text-[1.15em]";

// The success state must outlast its 340ms entrance. At the previous 300ms the animation was cut off
// mid-overshoot, which is what made a completed action read as "nothing happened".
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
  // Route-scoped look swap (recipe slot). Behavior below is untouched by a swap.
  const recipe = useUiRecipe("button") ?? buttonRecipe;
  // `shown` is which indicator the overlay holds, tracked apart from `mode` because the overlay stays mounted
  // and fades on opacity. Deriving it from `mode` swapped the check back to the spinner the instant the state
  // went idle, so the 200ms fade-out played as a flash of "loading" after a completed action.
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
          // `relative` is the hold overlay's containing block — the component's need, so it is not baked into
          // the recipe, where it would also land on every raw `buttonRecipe()` call site.
          //
          // While busy the button is disabled only to swallow duplicate clicks, so the recipe's
          // `disabled:opacity-50` has to be cancelled: an action in flight — and especially one that just
          // succeeded — must not read as greyed-out/unavailable. A caller-supplied `disabled` keeps the dim.
          cn(loadingMode === "hold" && "relative", busy && !rest.disabled && "disabled:opacity-100", className),
        )}
        {...rest}
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
              // onError already reported a failure — do not paint success over it.
              if (errored) return;
              setState({ mode: "success", error: null, shown: "success" });
              setTimeout(() => {
                // Spread so `shown` survives: the overlay keeps the check while it fades out.
                setState((s) => ({ ...s, mode: "idle", error: null }));
                onSuccess?.(awaited);
              }, successDwellMs);
            } catch {
              // The thrower (store action / fetch) already surfaced the error; reset so the button
              // cannot stay disabled in `loading` forever. `shown` stays "loading", so the fade-out
              // is the spinner — a failed action must never flash a success check.
              setState((s) => ({ ...s, mode: "idle", error: null }));
            }
          })();
        }}
      >
        {loadingMode === "replace" ? (
          // Both labels sit in the same grid cell, so the track is the wider of the two and the box is fixed
          // from first paint. Cross-fading between them is what CSS can actually animate here.
          // `place-items-center` centers each label in the cell explicitly. Without it the items rely on
          // grid's default `stretch` plus their own `justify-center`, which lands the label off-centre in the
          // track whenever the two labels differ in width — the visible symptom being a label that hugs the
          // left of an otherwise correct box.
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
                  <AiFillCheckCircle className={successIconClass} /> {l("base.processed")}
                </>
              ) : (
                <>
                  <AiOutlineLoading3Quarters className="animate-spin" /> {l("base.processing")}
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
                <AiFillCheckCircle className={successIconClass} />
              ) : (
                <AiOutlineLoading3Quarters className="animate-spin" />
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

/**
 * Button whose async states are driven by the handler's return value: return a promise and it shows a
 * pending indicator, then a brief success state; return nothing and it behaves as a plain button. Resolves
 * to a route-scoped override when a `page/**\/_overrides.tsx` in the route's ancestry declares one,
 * otherwise renders {@link DefaultButton}. The public generic signature is preserved, so
 * `<Button<Todo> onSuccess={(r: Todo) => …} />` still infers.
 */
export const Button = <Result = unknown>(props: ButtonProps<Result>) => {
  const Override = useUiOverride("Button");
  const Impl = (Override ?? DefaultButton) as unknown as ComponentType<ButtonProps<Result>>;
  return createElement(Impl, props);
};
