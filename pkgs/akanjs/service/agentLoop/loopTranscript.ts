import type {
  AgentWireAttachment,
  AgentWireMessage,
  AgentWireToolCall,
  AgentWireToolResult,
} from "../predefinedAdaptor/llm.adaptor";

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
    const unanswered = LoopTranscript.#unanswered(messages);
    const called = new Set<string>();
    const paired = new Set<string>();
    const kept: AgentWireMessage[] = [];
    for (const [at, message] of messages.entries()) {
      if (message.role === "tool") {
        //? A retried run may store one tool message twice, and a provider refuses two results for one call.
        const results = (message.toolResults ?? []).filter((result) => called.has(result.id) && !paired.has(result.id));
        for (const result of results) paired.add(result.id);
        if (results.length) LoopTranscript.#answer(kept, { ...message, toolResults: results });
        continue;
      }
      if (message.role === "assistant" && !LoopTranscript.carries(message)) continue;
      kept.push(message);
      const calls = message.toolCalls ?? [];
      for (const call of calls) {
        called.add(call.id);
        paired.delete(call.id);
      }
      const stopped = unanswered.get(at) ?? [];
      // A model told the call was stopped asks again; one shown no call at all answers as if it had the result.
      if (stopped.length)
        LoopTranscript.#answer(kept, {
          role: "tool",
          toolResults: stopped.map((call) => ({ id: call.id, name: call.name, error: LoopTranscript.unanswered })),
        });
    }
    return kept;
  }

  //? Read from the end, as a result answers the nearest call before it: some models reuse an id across turns, and by id
  //? alone the earlier turn's result would make a later call nothing answered look answered.
  static #unanswered(messages: readonly AgentWireMessage[]): Map<number, AgentWireToolCall[]> {
    const waiting = new Set<string>();
    const unanswered = new Map<number, AgentWireToolCall[]>();
    for (let at = messages.length - 1; at >= 0; at -= 1) {
      const { toolCalls = [], toolResults = [] } = messages[at] ?? {};
      for (const result of toolResults) waiting.add(result.id);
      const stopped = toolCalls.filter((call) => !waiting.has(call.id));
      if (stopped.length) unanswered.set(at, stopped);
      for (const call of toolCalls) waiting.delete(call.id);
    }
    return unanswered;
  }

  //? A batch is stored one tool message a call, and OpenAI's dialect puts a message's pictures straight after its
  //? answers, which between two of them leaves a call unanswered when the next non-tool message arrives.
  static #answer(kept: AgentWireMessage[], message: AgentWireMessage) {
    const last = kept.at(-1);
    if (last?.role !== "tool") kept.push(message);
    else
      kept[kept.length - 1] = { ...last, toolResults: [...(last.toolResults ?? []), ...(message.toolResults ?? [])] };
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

  //? Security: where the pending batch's own stored results begin. A resumed run judges that batch on the messages
  //? before them, as the run that died did: the model wrote every call of it before any of its results was read.
  static pendingAnswersAt(messages: readonly AgentWireMessage[]): number {
    if (!LoopTranscript.pending(messages).length) return messages.length;
    return messages.findLastIndex((message) => message.role !== "tool") + 1;
  }

  //? Security: a summary replaced the results `untrusted` would judge, so an unmarked one counts as tainted to a run that
  //? judges; a tool message's mark stands for what clipping took from the results it stores.
  static markedTainted(messages: readonly AgentWireMessage[], judging: boolean): boolean {
    return messages.some(({ summary, tainted }) => tainted ?? (!!summary && judging));
  }

  static results(messages: readonly AgentWireMessage[]): AgentWireToolResult[] {
    return messages.flatMap((message) => (message.role === "tool" ? (message.toolResults ?? []) : []));
  }
}
