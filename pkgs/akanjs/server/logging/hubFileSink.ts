import { Logger, logSeverity } from "akanjs/common";
import type { LogHub, LogHubEntry } from "./logHub";
import { LogStdoutWriter } from "./logStdoutWriter";
import type { RotatingLogWriter } from "./rotatingLogWriter";

export interface HubFileSinkOptions {
  minSev: number;
  /** `ndjson-only` writes the file as JSON lines too; plain `ndjson` keeps the text file a human reads. */
  json: boolean;
}

// In an ndjson deployment a child writes no text line to relay, so the log file is fed from the hub's records.
export class HubFileSink {
  #subscription: { unsubscribe(): void } | null;

  constructor(hub: LogHub, writer: RotatingLogWriter, { minSev, json }: HubFileSinkOptions) {
    this.#subscription = hub.subscribe(
      { minSev },
      (entry) => {
        writer.write(
          HubFileSink.processKey(entry),
          json ? LogStdoutWriter.line(entry) : Logger.stripAnsi(Logger.render(entry.record)),
        );
      },
      { exact: true },
    );
  }

  static attach(writer: RotatingLogWriter, hub: LogHub | null, label: string): () => void {
    if (!hub || !Logger.isNdjson) return Logger.addSink((entry) => void writer.write(label, entry.plainMessage));
    const sink = new HubFileSink(hub, writer, {
      minSev: logSeverity[Logger.fileLevel],
      json: Logger.format === "ndjson-only",
    });
    return () => sink.close();
  }

  static processKey({ record }: LogHubEntry): string {
    const role = record.role ?? "app";
    if (role === "gateway" || record.replicaIdx === null) return role;
    return `${record.replicaIdx}-${role}`;
  }

  close() {
    this.#subscription?.unsubscribe();
    this.#subscription = null;
  }
}
