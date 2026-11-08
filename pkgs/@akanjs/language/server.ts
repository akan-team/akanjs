#!/usr/bin/env node
import { AkanLanguageServer } from "./akanLanguageServer";
import type { Ts } from "./ast";

if (!process.argv.includes("--stdio")) {
  process.stderr.write("akan-language-server speaks LSP over stdio: run it as `akan-language-server --stdio`.\n");
  process.exit(2);
}

const ts = await import("typescript").then(
  (loaded: { default?: Ts }) => loaded.default ?? (loaded as Ts),
  () => null,
);
if (!ts) {
  process.stderr.write("akan-language-server needs the `typescript` package installed next to @akanjs/language.\n");
  process.exit(1);
}

new AkanLanguageServer({ ts, input: process.stdin, output: process.stdout, exit: (code) => process.exit(code) });
