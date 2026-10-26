import type { ClassNameValue as ClassValue } from "tailwind-merge";
import { tv as joinTv } from "tailwind-variants/lite";
import { cn } from "../../client/cn";

type SlotStyles = Record<string, (slotProps?: object) => string | undefined>;

//? `lite` joins without merging: the full build inlines its own tailwind-merge copy (~30 KB) beside the one `cn`
//? already ships, so every output merges once through `cn` here, which also knows akan's tokens.
export const tv = ((options: Parameters<typeof joinTv>[0]) => {
  const styles = joinTv(options);
  const merged = (props?: object) => {
    const result = (styles as unknown as (props?: object) => string | SlotStyles | undefined)(props);
    if (typeof result !== "object") return cn(result);
    return Object.fromEntries(
      Object.entries(result).map(([slot, styleOf]) => [slot, (slotProps?: object) => cn(styleOf(slotProps))]),
    );
  };
  // `extend` reads a parent's base, variants and slots off these properties.
  return Object.assign(merged, styles);
}) as typeof joinTv;

/** `className` takes arrays and falsy values and is merged inside, so never wrap it in `cn()`. */
export const recipe =
  <P extends object>(styles: (props?: P) => string) =>
  (variants?: Omit<P, "class" | "className">, className?: ClassValue): string =>
    cn(styles(variants as P), className);
