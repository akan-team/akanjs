import { describe, expect, it } from "bun:test";
import ts from "typescript";
import { FrameworkMapBuilder } from "./frameworkMapBuilder";

const files: Record<string, string> = {
  "pkgs/akanjs/index.ts": `export * from "./base";\n`,
  "pkgs/akanjs/base/scalar.ts": `export class Scalar {\n  a = 1;\n}\n`,
  "pkgs/akanjs/common/logger.ts": `import { Scalar } from "akanjs/base/scalar";
export class Logger {
  a = 1;
  b = 2;
}
export class Tiny {}
`,
  "pkgs/akanjs/common/types.ts": `import type { Server } from "../server/server";
export { type Server as Served } from "../server/server";
export type S = Server;
`,
  "pkgs/akanjs/server/ipcTypes.ts": `export type Ipc =
  | { type: "ready"; pid: number }
  | { type: "ping"; sentAt: number }
  | { type: "log"; records: string[]; pid?: number }
  | Pong;
type Pong = { type: "pong"; sentAt: number };
`,
  "pkgs/akanjs/server/result.ts": `export type Outcome = { type: "ready" } | { type: "failed"; reason: string };
`,
  "pkgs/akanjs/server/server.ts": `import { Logger } from "akanjs/common/logger";
import type { Ipc } from "./ipcTypes";
import type { Outcome } from "./result";
const lazy = () => import("../base/scalar");
export class Server {
  start() {
    process.send?.({ type: "ready", pid: process.pid });
    process.on("message", (msg: Ipc) => this.#handle(msg));
  }
  #handle(msg: Ipc) {
    if (msg.type === "ping") process.send?.({ type: "pong", sentAt: msg.sentAt });
  }
  report(outcome: Outcome) {
    if (outcome.type === "ready") return true;
    return { type: "ready" };
  }
}
`,
  "pkgs/akanjs/server/gateway.ts": `const routed = new Set<Ipc["type"]>(["ready", "log"]);
export class Gateway {
  onMessage(message: Ipc) {
    switch (message.type) {
      case "ready":
      case "pong":
        return routed;
    }
  }
  ping(child: { send: (msg: unknown) => void }) {
    const msg: Ipc = { type: "ping", sentAt: Date.now() };
    child.send(msg);
    child.send({ type: "log", records: [], ...{ pid: 1 } });
  }
}
`,
  "pkgs/akanjs/server/hub.ts": `import type { Ipc } from "./ipcTypes";
export const toPong = (sentAt: number): Ipc => ({ type: "pong", sentAt });
export class Hub {
  #count = 0;
  wake() {
    this.#fanout({ type: "log", records: [] });
  }
  ask() {
    return this.#call((sentAt) => ({ type: "ping", sentAt }));
  }
  #fanout(message: Ipc) {
    if (message.type === "log") this.#count += 1;
  }
  #call(make: (sentAt: number) => object) {
    return make(Date.now());
  }
  readonly #onMessage = (message: unknown) => {
    const data = message as { type?: string; pid?: number; outcome?: Outcome };
    if (data.type === "ready") this.#count += 1;
  };
}
`,
  "pkgs/akanjs/server/batch.ts": `import type { Ipc } from "./ipcTypes";
export interface Prepared {
  files: string[];
  event: Extract<Ipc, { type: "ready" }>;
}
export const prepare = (files: string[]): Prepared => ({ files, event: { type: "ready", pid: 1 } });
export const merge = (a: Extract<Ipc, { type: "log" }>, b: Extract<Ipc, { type: "log" }>): Ipc => ({
  type: "log",
  records: [...a.records, ...b.records],
});
`,
  "pkgs/akanjs/server/server.test.ts": `export class Ignored {}\n`,
  "pkgs/@akanjs/devkit/host.ts": `import { Server } from "akanjs/server/server";
export class Host {}
`,
};

const build = (channels = [{ file: "pkgs/akanjs/server/ipcTypes.ts", union: "Ipc", label: "gateway ⇄ child" }]) =>
  new FrameworkMapBuilder({
    ts,
    packages: [
      { name: "akanjs", root: "pkgs/akanjs", split: true },
      { name: "@akanjs/devkit", root: "pkgs/@akanjs/devkit", split: false },
    ],
    files: Object.entries(files).filter(([file]) => FrameworkMapBuilder.isSourcePath(file)),
    channels,
  }).build();

describe("FrameworkMapBuilder", () => {
  it("splits akanjs by facet, keeps devkit whole and skips root files and tests", () => {
    const map = build();
    expect(map.facets.map(({ id, name, files }) => `${id}:${name}:${files}`)).toEqual([
      "@akanjs/devkit:@akanjs/devkit:1",
      "akanjs/base:base:1",
      "akanjs/common:common:2",
      "akanjs/server:server:6",
    ]);
    expect(
      map.facets.find(({ id }) => id === "akanjs/common")?.classes.map(({ name, members }) => `${name}:${members}`),
    ).toEqual(["Logger:2", "Tiny:0"]);
    expect(map.facets.flatMap(({ classes }) => classes.map(({ name }) => name))).not.toContain("Ignored");
  });

  it("counts facet imports by kind and layers facets by value imports only", () => {
    const map = build();
    expect(
      map.imports.map(({ from, to, value, type, dynamic }) => `${from}>${to} v${value} t${type} d${dynamic}`),
    ).toEqual([
      "@akanjs/devkit>akanjs/server v1 t0 d0",
      "akanjs/common>akanjs/base v1 t0 d0",
      "akanjs/common>akanjs/server v0 t2 d0",
      "akanjs/server>akanjs/base v0 t0 d1",
      "akanjs/server>akanjs/common v1 t0 d0",
    ]);
    expect(Object.fromEntries(map.facets.map(({ id, layer }) => [id, layer]))).toEqual({
      "@akanjs/devkit": 3,
      "akanjs/base": 0,
      "akanjs/common": 1,
      "akanjs/server": 2,
    });
  });

  it("puts facets that load values from each other in one layer, and reports them", () => {
    const map = new FrameworkMapBuilder({
      ts,
      packages: [{ name: "akanjs", root: "pkgs/akanjs", split: true }],
      files: [
        ["pkgs/akanjs/base/a.ts", `import { C } from "../common/c";\nexport class A {}\n`],
        ["pkgs/akanjs/common/c.ts", `import { A } from "../base/a";\nexport class C {}\n`],
        ["pkgs/akanjs/server/s.ts", `import { C } from "../common/c";\nexport class S {}\n`],
      ],
      channels: [],
    }).build();
    expect(map.cycles).toEqual([["akanjs/base", "akanjs/common"]]);
    expect(Object.fromEntries(map.facets.map(({ id, layer }) => [id, layer]))).toEqual({
      "akanjs/base": 0,
      "akanjs/common": 0,
      "akanjs/server": 1,
    });
    expect(build().cycles).toEqual([]);
  });

  it("names who sends and who handles each message of a channel", () => {
    const [channel] = build().channels;
    const table = Object.fromEntries(
      channel.messages.map(({ type, senders, handlers }) => [
        type,
        `${senders.map(({ owner, count }) => `${owner}×${count}`).join(",")} | ${handlers.map(({ owner }) => owner).join(",")}`,
      ]),
    );
    expect(table).toEqual({
      ready: "Server×1,prepare×1 | Gateway,Hub",
      ping: "Gateway×1,Hub×1 | Server",
      log: "Gateway×1,Hub×1 | Gateway",
      pong: "Server×1,toPong×1 | Gateway",
    });
    expect(channel.at).toEqual({ file: "pkgs/akanjs/server/ipcTypes.ts", line: 1, column: 13 });
  });

  it("reports a channel whose union is gone", () => {
    expect(build([{ file: "pkgs/akanjs/server/ipcTypes.ts", union: "Gone", label: "" }]).missing).toEqual([
      "Gone in pkgs/akanjs/server/ipcTypes.ts",
    ]);
  });
});
