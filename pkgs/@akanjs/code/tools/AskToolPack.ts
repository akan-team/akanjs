import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import type { CodeAgentProfile, CodeAgentQuestion } from "akanjs/common";
import { Type } from "typebox";

export interface AskToolPackOptions {
  profile: CodeAgentProfile;
  /** Puts one question on the wire and resolves with the labels chosen, or nothing when it was skipped. */
  ask: (question: Omit<CodeAgentQuestion, "questionId">) => Promise<string | undefined>;
}

// One question at a time even when several are sent: the host draws one block, and an answer can change the next.
export class AskToolPack {
  static readonly toolName = "ask_user";
  /** Four is what fits on a screen without the transcript disappearing behind the questions. */
  static readonly maxQuestions = 4;

  readonly #options: AskToolPackOptions;

  constructor(options: AskToolPackOptions) {
    this.#options = options;
  }

  names() {
    return this.#options.profile.ui.canPrompt ? [AskToolPack.toolName] : [];
  }

  extension(): InlineExtension | undefined {
    if (!this.#options.profile.ui.canPrompt) return undefined;
    return { name: "akan-ask", factory: (pi: ExtensionAPI) => this.#register(pi) };
  }

  #register(pi: ExtensionAPI) {
    pi.registerTool({
      name: AskToolPack.toolName,
      label: "Ask",
      description:
        "Ask the user to decide something you cannot decide from the code or the request. Use it when two readings of the task would lead to materially different work, not for choices with an obvious default — and never to ask permission for work you were already asked to do. Offer concrete options whenever you can name them; mark one recommended when you have a view.",
      promptSnippet: "ask_user: put a decision the user owns back to them, with options",
      parameters: Type.Object({
        questions: Type.Array(
          Type.Object({
            question: Type.String({ description: "The whole question, as one sentence ending in a question mark." }),
            header: Type.Optional(
              Type.String({ description: "Two or three words naming what is being chosen, e.g. 'Auth method'." }),
            ),
            options: Type.Optional(
              Type.Array(
                Type.Object({
                  label: Type.String({ description: "The choice, in one to five words." }),
                  detail: Type.Optional(
                    Type.String({ description: "What picking it means, or the trade-off it carries." }),
                  ),
                  recommended: Type.Optional(
                    Type.Boolean({ description: "Mark at most one. It is offered first and labelled as such." }),
                  ),
                }),
                { description: "Two to four distinct choices. Leave it out to ask for an answer in prose." },
              ),
            ),
            multiSelect: Type.Optional(
              Type.Boolean({ description: "Several options may be chosen together, rather than exactly one." }),
            ),
            freeText: Type.Optional(
              Type.Boolean({
                description: "Offer a further choice that lets the user type an answer of their own. Default true.",
              }),
            ),
          }),
          { description: `One to ${AskToolPack.maxQuestions} questions, asked in order.` },
        ),
      }),
      execute: async (_id, params) => {
        const questions = (params.questions ?? []).slice(0, AskToolPack.maxQuestions);
        if (!questions.length)
          return { content: [{ type: "text", text: "No question was asked." }], details: undefined, isError: true };
        const answers: string[] = [];
        for (const entry of questions) {
          const options = (entry.options ?? []).map((option, at) => ({
            key: `${at}`,
            label: option.label,
            ...(option.detail ? { detail: option.detail } : {}),
            ...(option.recommended ? { recommended: true } : {}),
          }));
          const answer = await this.#options.ask({
            prompt: entry.header ? `${entry.header} — ${entry.question}` : entry.question,
            kind: options.length ? "select" : "text",
            ...(options.length ? { options } : {}),
            ...(entry.multiSelect ? { multiSelect: true } : {}),
            // On by default: the model's options are a guess, and only the person knows when none of them fits.
            freeText: entry.freeText ?? true,
          });
          // Spelled out as a skip: a blank answer reads to a model as "the user wanted nothing".
          answers.push(`${entry.question}\n→ ${answer ?? "(skipped — decide this yourself and say what you chose)"}`);
        }
        return { content: [{ type: "text", text: answers.join("\n\n") }], details: undefined };
      },
    });
  }
}
