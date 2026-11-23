import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

export const esc = String.fromCharCode(27);
export const csi = new RegExp(`${esc}\\[[0-9;?]*[a-zA-Z]`, "g");

export class FakeStdout extends EventEmitter {
  readonly frames: string[] = [];
  constructor(
    readonly columns: number,
    readonly rows: number,
    readonly isTTY = false,
  ) {
    super();
  }
  write = (frame: string) => {
    this.frames.push(frame);
    return true;
  };
  // With a cursor position set, Ink follows each content frame with a cursor-only write.
  get lastFrame() {
    for (let at = this.frames.length - 1; at >= 0; at -= 1) {
      const text = (this.frames[at] ?? "").replace(csi, "");
      if (text.trim()) return text;
    }
    return "";
  }
}

export const makeStdin = () => {
  const stdin = new PassThrough() as PassThrough & {
    isTTY: boolean;
    setRawMode: (raw: boolean) => void;
    ref: () => void;
    unref: () => void;
  };
  stdin.isTTY = true;
  stdin.setRawMode = () => undefined;
  stdin.ref = () => undefined;
  stdin.unref = () => undefined;
  return stdin;
};

// Ink throttles frame writes to `maxFps: 30`; anything shorter reads the previous frame.
export const nextFrame = () => Bun.sleep(80);
