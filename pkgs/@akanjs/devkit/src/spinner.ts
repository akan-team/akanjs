import ora from "ora";

export class Spinner {
  static padding = 12;
  spinner: ora.Ora;
  stopWatch: NodeJS.Timeout | null = null;
  startAt: Date = new Date();
  prefix: string;
  message: string;
  enableSpin: boolean;
  constructor(message: string, { prefix = "", indent = 0, enableSpin = true } = {}) {
    Spinner.padding = Math.max(Spinner.padding, prefix.length);
    this.prefix = prefix;
    this.message = message;
    this.spinner = ora(message);
    this.spinner.prefixText = prefix.padStart(Spinner.padding, " ");
    this.spinner.indent = indent;
    this.enableSpin = enableSpin;
  }
  start() {
    this.startAt = new Date();
    if (this.enableSpin) {
      this.spinner.start();
      this.stopWatch = setInterval(() => {
        this.spinner.prefixText = this.prefix.padStart(Spinner.padding, " ");
        this.spinner.text = `${this.message} (${this.#getElapsedTimeStr()})`;
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
  #getElapsedTimeStr() {
    const ms = new Date().getTime() - this.startAt.getTime();
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  }
}
