import type { AgentWireAttachment, AgentWireMessage, AgentWireToolResult } from "../predefinedAdaptor/llm.adaptor";

//? A server twin of use-agentic's Transcript, which the server may not import; keep the two in step.
export class LoopTranscript {
  static readonly unanswered = "The turn was stopped before this call ran.";

  static wire(messages: readonly AgentWireMessage[]): AgentWireMessage[] {
    return LoopTranscript.sanitize(LoopTranscript.seen(messages));
  }

  //? A file a tool returned before the latest ask rides every later turn at over a thousand tokens; the tool can fetch it again.
  static seen(messages: readonly AgentWireMessage[]): AgentWireMessage[] {
    const latest = messages.findLastIndex((message) => message.role === "user" && !message.summary);
    if (latest <= 0) return [...messages];
    return messages.map((message, at) =>
      at < latest && message.toolResults?.some(LoopTranscript.#carriesFile)
        ? { ...message, toolResults: message.toolResults.map(LoopTranscript.#noted) }
        : message,
    );
  }

  static #carriesFile(result: AgentWireToolResult): boolean {
    return !!result.attachments?.some((attachment) => !attachment.text);
  }

  static #noted(result: AgentWireToolResult): AgentWireToolResult {
    if (!LoopTranscript.#carriesFile(result)) return result;
    const attachments = result.attachments?.map(
      (attachment): AgentWireAttachment =>
        attachment.text
          ? attachment
          : {
              name: attachment.name,
              mimeType: attachment.mimeType,
              text: `[Seen earlier and no longer attached. To look at it again, call ${result.name} again.]`,
            },
    );
    return { ...result, attachments };
  }

  //? Every provider refuses a call without its result or a result without its call, on this turn and every later one.
  static sanitize(messages: readonly AgentWireMessage[]): AgentWireMessage[] {
    const answered = new Set(messages.flatMap((message) => (message.toolResults ?? []).map((result) => result.id)));
    const called = new Set<string>();
    const kept: AgentWireMessage[] = [];
    for (const message of messages) {
      if (message.role === "tool") {
        const results = (message.toolResults ?? []).filter((result) => called.has(result.id));
        if (results.length) kept.push({ ...message, toolResults: results });
        continue;
      }
      if (message.role === "assistant" && !LoopTranscript.carries(message)) continue;
      kept.push(message);
      const calls = message.toolCalls ?? [];
      for (const call of calls) called.add(call.id);
      const unanswered = calls.filter((call) => !answered.has(call.id));
      // A model told the call was stopped asks again; one shown no call at all answers as if it had the result.
      if (unanswered.length)
        kept.push({
          role: "tool",
          toolResults: unanswered.map((call) => ({ id: call.id, name: call.name, error: LoopTranscript.unanswered })),
        });
    }
    return kept;
  }

  static carries(message: AgentWireMessage) {
    return (
      !!message.text ||
      !!message.error ||
      !!message.toolCalls?.length ||
      !!message.attachments?.length ||
      !!message.references?.length
    );
  }

  static pending(messages: readonly AgentWireMessage[]) {
    const at = messages.findLastIndex((message) => message.role !== "tool");
    const last = messages[at];
    if (last?.role !== "assistant" || !last.toolCalls?.length) return [];
    const answered = new Set(messages.slice(at + 1).flatMap((message) => (message.toolResults ?? []).map((r) => r.id)));
    return last.toolCalls.filter((call) => !answered.has(call.id));
  }

  //? Security: a summary replaced the results `untrusted` would judge, so an unmarked one counts as tainted to a run that judges.
  static summaryTainted(messages: readonly AgentWireMessage[], judging: boolean): boolean {
    return messages.some(({ summary, tainted }) => summary && (tainted ?? judging));
  }

  static results(messages: readonly AgentWireMessage[]): AgentWireToolResult[] {
    return messages.flatMap((message) => (message.role === "tool" ? (message.toolResults ?? []) : []));
  }
}
