export const transitionTypes = ["none", "fade", "bottomUp", "stack", "scaleOut"] as const;
export type TransitionType = (typeof transitionTypes)[number];
