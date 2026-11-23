import { Console } from "node:console";

// Bun's native `console` writes to fd 1 directly, past the engine's stdout guard, corrupting the RPC stream.
// Must be the first import of an RPC entry: ESM evaluates imports first, so an inline assignment runs too late.
globalThis.console = new Console({
  stdout: process.stderr,
  stderr: process.stderr,
}) as unknown as typeof globalThis.console;
