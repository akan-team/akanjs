export const transitionTypes = ["none", "fade", "bottomUp", "stack", "scaleOut"] as const;
export type TransitionType = (typeof transitionTypes)[number];

/** The class `ui/styles.css` animates a page by when a navigation plays `transition` forward (push) or back (pop). */
export const viewTransitionClassOf = (transition: Exclude<TransitionType, "none">, direction: "push" | "pop") =>
  `akan-${transition}-${direction}` as const;
