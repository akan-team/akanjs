import type { CodeAgentCommand, CodeAgentEvent, CodeAgentReply, CodeAgentRequest } from "akanjs/common";
import type { CodeAgent } from "./CodeAgent";

// stdout carries only frames because `consoleToStderr` was imported before the engine (Bun's console bypasses it).
export class CodeAgentRpcHost {
  readonly #agent: CodeAgent;
  #write: ((line: string) => void) | null;
  #buffer = "";
  #started = false;
  #resolveShutdown: () => void = () => {};
  readonly shutdown = new Promise<void>((resolve) => {
    this.#resolveShutdown = resolve;
  });

  constructor(agent: CodeAgent, write: ((line: string) => void) | null = (line) => process.stdout.write(line)) {
    this.#agent = agent;
    this.#write = write;
  }

  async serve(input: AsyncIterable<Uint8Array> = process.stdin) {
    this.start();
    const decoder = new TextDecoder();
    for await (const chunk of input) await this.feed(decoder.decode(chunk, { stream: true }));
    await this.#agent.abort().catch(() => {});
  }

  start() {
    if (this.#started) return;
    this.#started = true;
    this.#agent.on((event) => this.#emit(event));
    this.#agent.announce();
  }

  //* Frames with no client attached are dropped; the next client catches up with `get_state { sinceSeq }`.
  attach(write: ((line: string) => void) | null) {
    this.#write = write;
    this.#buffer = "";
  }

  async feed(text: string) {
    this.#buffer += text;
    let index = this.#buffer.indexOf("\n");
    while (index >= 0) {
      const line = this.#buffer.slice(0, index).trim();
      this.#buffer = this.#buffer.slice(index + 1);
      if (line) await this.#handle(line);
      index = this.#buffer.indexOf("\n");
    }
  }

  async #handle(line: string) {
    let request: CodeAgentRequest;
    try {
      request = JSON.parse(line) as CodeAgentRequest;
    } catch {
      return this.#emit({ type: "error", message: "malformed command frame", fatal: false, seq: -1 });
    }
    try {
      this.#reply({ type: "reply", id: request.id, ok: true, data: await this.#run(request.command) });
    } catch (error) {
      this.#reply({ type: "reply", id: request.id, ok: false, error: String(error) });
    }
    //* After the reply, so a socket transport that closes on shutdown has already written the acknowledgement.
    if (request.command?.type === "shutdown") this.#resolveShutdown();
  }

  // `prompt` replies on acceptance, not completion, so the client can still send `abort` while the turn runs.
  async #run(command: CodeAgentCommand): Promise<unknown> {
    switch (command.type) {
      case "prompt":
        void this.#agent.prompt(command.message, command.images);
        return { accepted: true };
      case "answer":
        return { handled: await this.#agent.answer(command.questionId, command.answer) };
      case "approve":
        return { handled: await this.#agent.approve(command.approvalId, command.approved) };
      case "abort":
        await this.#agent.abort();
        return { aborted: true };
      case "compact":
        await this.#agent.compact(command.instructions);
        return { compacted: true };
      case "set_model":
        await this.#agent.setModel({ provider: command.provider, id: command.modelId });
        return await this.#agent.state();
      case "set_auto_compact":
        this.#agent.setAutoCompactAt(command.percent);
        return await this.#agent.state();
      case "get_state":
        return await this.#agent.state(command.sinceSeq === undefined ? {} : { sinceSeq: command.sinceSeq });
      case "shutdown":
        this.#agent.dispose();
        return { shutdown: true };
      default:
        throw new Error(`Unsupported command: ${command.type}`);
    }
  }

  #emit(event: CodeAgentEvent) {
    this.#write?.(`${JSON.stringify({ type: "event", event })}\n`);
  }

  #reply(reply: CodeAgentReply) {
    this.#write?.(`${JSON.stringify(reply)}\n`);
  }
}
