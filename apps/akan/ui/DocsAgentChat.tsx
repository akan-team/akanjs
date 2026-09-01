"use client";
import { useSpeech } from "@libs/util/webkit";
import { Agent } from "akanjs/ui";

/**
 * The docs chat with speech wired in. It exists as a client component because `voice` carries functions, and a
 * server layout cannot hand those across the RSC boundary — the same reason `attach` needs a wrapper like this.
 */
export const DocsAgentChat = () => {
  const voice = useSpeech();
  return <Agent.Chat persist voice={voice} />;
};
