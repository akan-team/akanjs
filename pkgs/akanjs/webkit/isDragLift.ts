const liftTypes = new Set(["pointerup", "touchend", "mouseup"]);

/**
 * Whether a drag ended because the finger or the button let go. A drag the browser or the system takes over (a native
 * scroll, an edge gesture) ends in `pointercancel` with the finger still down, so only a lift may act on its release.
 */
export const isDragLift = (event: Event | undefined) => !!event && liftTypes.has(event.type);
