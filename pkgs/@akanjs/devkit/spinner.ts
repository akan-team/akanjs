import ora, { type Ora } from "ora";

export class Spinner {
  static padding = 12;
  /**
   * XXX: `discardStdin` must stay off. It makes ora put the terminal into raw mode for as long as the
   * spinner runs, and a Bun child spawned in that window snapshots the raw termios and writes it back
   * when it exits — long after the spinner restored the terminal. `akan start` spawns the builder and
   * the backend under the "Preparing backend..." spinner, so the first builder recycle (a config or
   * runtime-metadata change) SIGTERMs that child and silently turns the developer's terminal raw:
   * `isig` goes off, Ctrl+C stops producing SIGINT at all, and the dev server looks unkillable.
   */
  static oraOptions = { discardStdin: false } as const;
  /**
   * ora sizes its clear loop as `ceil(lineWidth / stream.columns)`, so a tty that reports **0** columns
   * makes it `Infinity` and `clear()` never returns. An unsized pty does exactly that (`isTTY: true`,
   * `columns: 0`) — CI runners, `expect`/`script` harnesses, some detached panes. Measured: 750MB of
   * cursor moves and 8.7GB RSS inside a minute, in a loop that no longer reaches the point where SIGINT
   * or SIGTERM could be handled, so only SIGKILL ends it. A terminal with no width has nothing to
   * animate anyway; fall back to plain lines.
   */
  static canAnimate(stream: NodeJS.WriteStream = process.stderr): boolean {
    return !stream.isTTY || stream.columns > 0;
  }
  spinner: Ora;
  stopWatch: NodeJS.Timeout | null = null;
  startAt: Date = new Date();
  prefix: string;
  message: string;
  enableSpin: boolean;
  constructor(message: string, { prefix = "", indent = 0, enableSpin = true } = {}) {
    Spinner.padding = Math.max(Spinner.padding, prefix.length);
    this.prefix = prefix;
    this.message = message;
    this.spinner = ora({ ...Spinner.oraOptions, text: message });
    this.spinner.prefixText = prefix.padStart(Spinner.padding, " ");
    this.spinner.indent = indent;
    this.enableSpin = enableSpin && Spinner.canAnimate();
  }
  start() {
    this.startAt = new Date();
    if (this.enableSpin) {
      this.spinner.start();
      this.stopWatch = setInterval(() => {
        this.spinner.prefixText = this.prefix.padStart(Spinner.padding, " ");
        this.spinner.text = `${this.message} (${this.#getElapsedTimeStr({ floor: true })})`;
      }, 1000);
    } else this.spinner.info();
    return this;
  }
  succeed(message: string) {
    this.spinner.succeed(`${message} (${this.#getElapsedTimeStr()})`);
    this.#reset();
  }
  fail(message: string) {
    this.spinner.fail(`${message} (${this.#getElapsedTimeStr()})`);
    this.#reset();
  }
  isSpinning() {
    return this.spinner.isSpinning;
  }
  #reset() {
    if (this.stopWatch) clearInterval(this.stopWatch);
    this.stopWatch = null;
  }
  #getElapsedTimeStr({ floor = false }: { floor?: boolean } = {}) {
    const ms = Date.now() - this.startAt.getTime();
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${floor ? Math.floor(ms / 1000) : Math.floor(ms / 100) / 10}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  }
}
