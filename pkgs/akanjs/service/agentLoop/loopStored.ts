import type { AgentWireMessage, AgentWireToolCall, AgentWireToolResult } from "../predefinedAdaptor/llm.adaptor";
import { LoopTranscript } from "./loopTranscript";

export class LoopStored {
  static unknownTool(name: string) {
    return `Unknown tool: ${name}.`;
  }

  //? Security: whose result a stored one is can be read only off the call its id answers and this run's tools. One the
  //? run answers itself (`own`) is left out; an endpoint's (`listed`) comes back under its call's name, for `untrusted`
  //? to judge; a page's, and one whose tool this run does not have, comes back as `null`: it taints unasked, whatever
  //? name or mark it was stored under.
  static read(
    messages: readonly AgentWireMessage[],
    listed: ReadonlySet<string>,
    own: (call: AgentWireToolCall) => boolean,
  ): (AgentWireToolResult | null)[] {
    return LoopTranscript.answered(messages).flatMap(([result, call]) => {
      if (call && (own(call) || LoopStored.#isUnknownRefusal(result, call))) return [];
      return [call && listed.has(call.name) ? { ...result, name: call.name } : null];
    });
  }

  //? Security: this run's own answer to a name the model made up carries nothing read, as the call fixes its every
  //? character. `code` alone would not say so, and anything stored beside the sentence is not this run's.
  static #isUnknownRefusal(stored: AgentWireToolResult, call: AgentWireToolCall) {
    const { error, result, changes, attachments } = stored;
    if (error !== LoopStored.unknownTool(call.name)) return false;
    return result === undefined && changes === undefined && attachments === undefined;
  }
}
