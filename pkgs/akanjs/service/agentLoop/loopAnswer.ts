import { FailureCode } from "akanjs/common";
import { Err } from "akanjs/dictionary";
import type {
  AgentWireAttachment,
  AgentWireMessage,
  AgentWireToolCall,
  AgentWireToolResult,
} from "../predefinedAdaptor/llm.adaptor";
import type { AgentLoopCallAnswer } from "./agentLoopTypes";
import { LoopToolOutput } from "./loopToolOutput";
import { LoopTranscript } from "./loopTranscript";

export type LoopPark = "answer" | { refusal: string; code: string };

export class LoopAnswer {
  //? A screen tool returns one picture; a file's name and type are labels, bounded as a file system bounds a name.
  static readonly maxFiles = 4;
  static readonly maxLabelChars = 255;

  //? Security: client input. A run parks on the first call of its last batch nothing answered, so only that call takes
  //? an answer from outside, and the result is named by the call, never by what was sent. Whether a remote is connected
  //? is the server's to see, so the open of one takes only the person's refusal, and stores the run's own sentence for
  //? it: the `error` sent says that they refused, and none of its text is kept.
  static resultOf(
    answer: AgentLoopCallAnswer,
    messages: readonly AgentWireMessage[],
    parks: (call: AgentWireToolCall) => LoopPark | null,
  ): AgentWireToolResult {
    const sent = (answer as Partial<AgentLoopCallAnswer> | null) ?? {};
    const { id, result, error } = sent;
    if (typeof id !== "string" || !id) throw new Err("base.error.invalidArgument", { name: "answer" });
    const [parked] = LoopTranscript.pending(messages);
    const park = parked?.id === id ? parks(parked) : null;
    if (!parked || !park) throw new Err("agent.error.answerRefused", { id });
    if (park === "answer") return LoopAnswer.bounded(parked, sent);
    if (result !== undefined || typeof error !== "string" || !error) throw new Err("agent.error.answerRefused", { id });
    return { id: parked.id, name: parked.name, error: park.refusal, code: park.code };
  }

  //? Security: what another party sent as a call's result, a page or a remote. Only the fields a result declares pass,
  //? each by type and under its bound, as anything kept rides every later round.
  static bounded({ id, name }: Pick<AgentWireToolCall, "id" | "name">, sent: unknown): AgentWireToolResult {
    const { result, changes, error, code, attachments } = (sent ?? {}) as Partial<AgentWireToolResult>;
    return {
      id,
      name,
      ...(result !== undefined ? { result } : {}),
      ...(Array.isArray(changes) ? { changes: LoopAnswer.#changes(changes) } : {}),
      ...(typeof error === "string" && error ? { error } : {}),
      ...(FailureCode.is(code) ? { code } : {}),
      ...(Array.isArray(attachments) ? { attachments: LoopAnswer.#files(attachments) } : {}),
    };
  }

  //? How many changes and how long each `path` is are the sender's to choose, so the list is bounded as one value.
  static #changes(changes: unknown[]): unknown[] {
    const whole = LoopToolOutput.within(changes);
    return whole === changes ? changes : [whole];
  }

  //? Security: a file arrives as its bytes or its text. A `url` is fetched by the provider, from an address the sender chose.
  static #files(attachments: unknown[]): AgentWireAttachment[] {
    const files = attachments.flatMap((attachment): AgentWireAttachment[] => {
      const { name, mimeType, data, text } = (attachment ?? {}) as Partial<AgentWireAttachment>;
      if (!LoopAnswer.#isLabel(name) || !LoopAnswer.#isLabel(mimeType)) return [];
      if (typeof data === "string" && data) return [{ name, mimeType, data }];
      return typeof text === "string" && text ? [{ name, mimeType, text }] : [];
    });
    return files.slice(0, LoopAnswer.maxFiles);
  }

  static #isLabel(value: unknown): value is string {
    return typeof value === "string" && value.length <= LoopAnswer.maxLabelChars;
  }
}
