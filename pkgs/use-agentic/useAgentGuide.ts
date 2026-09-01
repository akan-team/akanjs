"use client";
import { useEffect, useRef } from "react";
import { useScopePath, useSurface } from "./surfaceContext";

/**
 * Registers standing guidance for the agent while the component is mounted. Guidance is folded into the turn's
 * instructions — it directs the model, unlike context, which is framed as data. The text is captured at mount
 * like every declaration on the surface; remount to change it.
 */
export const useAgentGuide = (text: string): void => {
  const surface = useSurface();
  const scope = useScopePath();
  const captured = useRef(text);
  const scopeKey = scope.join(".");
  useEffect(() => surface.registerGuide(scope, captured.current), [surface, scopeKey]);
};
