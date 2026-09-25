import type { Guard } from "./guard";
import type { SignalContext } from "./signalContext";

export class Public implements Guard {
  static name = "Public";
  canPass(context: SignalContext): boolean {
    return true;
  }
}

export class None implements Guard {
  static name = "None";
  canPass(context: SignalContext): boolean {
    return false;
  }
}
