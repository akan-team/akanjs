import { Logger } from "akanjs/common";

export interface InterruptTeardownHooks {
  exit?: (code: number) => void;
  listen?: (onSignal: () => void) => void;
  report?: (message: string) => void;
}

// The session's only SIGINT listener: a listener replaces Ctrl+C's default exit, and two that each exit cut one
// another short, so teardowns collect here and the exit runs once, after all of them.
export class InterruptTeardown {
  readonly #teardowns: {
    run: () => Promise<void>;
    abandoned: string;
    exitCode: number;
    state: "pending" | "running" | "done";
  }[] = [];
  readonly #exit: (code: number) => void;
  readonly #listen: (onSignal: () => void) => void;
  readonly #report: (message: string) => void;
  #interrupted: boolean = false;
  #chain: Promise<void> = Promise.resolve();
  /** False when a supervised session's `DevSupervisor` drives the shutdown on this same signal. */
  ownsExit: boolean = true;

  constructor({ exit, listen, report }: InterruptTeardownHooks = {}) {
    this.#exit = exit ?? ((code) => process.exit(code));
    this.#listen =
      listen ??
      ((onSignal) => {
        process.on("SIGINT", onSignal);
      });
    this.#report = report ?? ((message) => Logger.rawLog(message, undefined, "error"));
  }

  /** `exitCode` is what a Ctrl+C that finished tearing down exits with; the highest registered one wins. */
  add(run: () => Promise<void>, abandoned: string, exitCode = 0) {
    this.#teardowns.push({ run, abandoned, exitCode, state: "pending" });
    if (this.#teardowns.length === 1) this.#listen(() => this.#onSignal());
  }

  /** Runs the teardowns, as Ctrl+C would, for a session that ended on its own; the caller exits. */
  async runAll() {
    await this.#runTeardowns();
  }

  #onSignal() {
    if (this.#interrupted) {
      for (const one of this.#teardowns) if (one.state !== "done") this.#report(one.abandoned);
      this.#exit(130);
      return;
    }
    this.#interrupted = true;
    void this.#runTeardowns().finally(() => {
      if (this.ownsExit) this.#exit(Math.max(0, ...this.#teardowns.map((one) => one.exitCode)));
    });
  }

  //? Newest first, one at a time: the app stops before the dev server it follows, and that before its database.
  //? Each teardown runs once: a Ctrl+C while a finished session tears down waits for that same run.
  async #runTeardowns() {
    this.#chain = this.#chain.then(async () => {
      for (const one of this.#teardowns.toReversed()) {
        if (one.state !== "pending") continue;
        one.state = "running";
        // Caught per teardown: one that fails must not keep the older ones from running.
        await one.run().catch(() => undefined);
        one.state = "done";
      }
    });
    await this.#chain;
  }
}
