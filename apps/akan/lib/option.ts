import { AkanOption } from "akanjs/server";
import { AnthropicLlm, LlmAdaptorRole, type LlmOption } from "akanjs/service";
import { Public } from "akanjs/signal";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions & {
  llm?: LlmOption;
};

export const option = new AkanOption<ModulesOptions>()
  .applyAdaptor(LlmAdaptorRole, AnthropicLlm)
  .setLlm((options) => ({ apiKey: options.llm?.apiKey, model: "claude-haiku-5-5" }))
  // The docs app has no accounts, and the chat is part of the documentation: anonymous is the decision.
  .setAgentAccess(Public)
  .setMcp({
    instructions:
      "The Akan.js framework documentation. Use searchDocPages to find pages by keyword and readDocPage to read one in full; listDocPages gives the whole index when you need to see what exists. Read the docs before writing Akan code — the conventions section in particular is enforced by lint and will fail a build if guessed at.",
  });
