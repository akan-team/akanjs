"use client";
import { useAgentGuide } from "use-agentic";

export interface GuideProps {
  instructions: string;
}

/**
 * Standing agent guidance scoped to a route subtree: render it from a `_layout.tsx` or a page and the text joins
 * the turn's instructions while that subtree is mounted. Nesting layers naturally — each mounted Guide contributes
 * its block, and navigating away withdraws it. Renders nothing.
 */
export const Guide = ({ instructions }: GuideProps) => {
  useAgentGuide(instructions);
  return null;
};
