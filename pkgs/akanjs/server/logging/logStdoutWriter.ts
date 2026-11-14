import type { LogHub, LogHubEntry } from "./logHub";

export interface LogStdoutWriterOptions {
  minSev: number;
  write?: (line: string) => void;
}

// The only stdout writer in an ndjson deployment (console output is off in every process), so a collector parses JSON.
export class LogStdoutWriter {
  readonly #write: (line: string) => void;
  #subscription: { unsubscribe(): void } | null;

  constructor(hub: LogHub, { minSev, write }: LogStdoutWriterOptions) {
    this.#write = write ?? ((line) => void process.stdout.write(line));
    this.#subscription = hub.subscribe({ minSev }, (entry) => this.#write(LogStdoutWriter.line(entry)), {
      exact: true,
    });
  }

  static json(entry: LogHubEntry) {
    return { seq: entry.seq, ...entry.record };
  }

  static line(entry: LogHubEntry): string {
    return `${JSON.stringify(LogStdoutWriter.json(entry))}\n`;
  }

  close() {
    this.#subscription?.unsubscribe();
    this.#subscription = null;
  }
}
