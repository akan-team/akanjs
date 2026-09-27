import { describe, expect, test } from "bun:test";
import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { stale } from "../../../scripts/contract.ts";
import { aclCheck, loadAcl } from "../src/acl.ts";
import { ID_BUNDLE, ID_DOCUMENT, ID_FILE_REF, ID_NAME } from "../src/contract.ts";
import {
  admitDocument,
  assetMime,
  decideNavigation,
  declares,
  fileMime,
  fileRefSandboxed,
  idValid,
  isHostPath,
  parseRange,
  RetainedEvents,
  route,
} from "../src/kernel.ts";
import { validateRequest } from "../src/protocol.ts";

// The same vectors run against the Rust (cargo test), Swift and Kotlin kernels (scripts/native-vectors.ts,
// and on the device through the self-test).
const load = async (name: string) => Bun.file(new URL(`../vectors/${name}.json`, import.meta.url)).json();
const routes = await load("routes");
const ranges = await load("ranges");
const ids = await load("ids");
const bridge = await load("bridge");
const navigation = await load("navigation");
const acl = await load("acl");
const retained = await load("retained");

test("the generated contract files are current (bun scripts/contract.ts)", () => {
  expect(stale()).toEqual([]);
});

describe("routes", () => {
  const files = new Set<string>(routes.files);
  test.each(routes.cases as [string, "files" | "all", string, string | null][])(
    "%j (%s) → %s %s",
    (path, exists, kind, value) => {
      const r = route(path, (rel) => exists === "all" || files.has(rel));
      expect([r.kind, "id" in r ? r.id : "path" in r ? r.path : null]).toEqual([kind, value]);
    },
  );
  test.each(routes.hostPaths as [string, boolean][])("host path %j: %p", (path, expected) => {
    expect(isHostPath(path)).toBe(expected);
  });
});

describe("ranges", () => {
  test.each(ranges.cases as [string | null, number, number[]][])("%j of %d bytes → %j", (header, size, expected) => {
    const r = parseRange(header, size);
    expect(r.status === 206 ? [206, r.start, r.end] : [r.status]).toEqual(expected);
  });
});

describe("ids and MIME types", () => {
  const specs = { fileRef: ID_FILE_REF, bundle: ID_BUNDLE, document: ID_DOCUMENT, name: ID_NAME };
  test.each(ids.cases as [keyof typeof specs, string, boolean][])("%s %j: %p", (kind, value, valid) => {
    expect(idValid(specs[kind], value)).toBe(valid);
  });
  test.each(ids.mime.cases as [string, string, string][])("%j → %s / %s", (path, asset, file) => {
    expect([assetMime(path), fileMime(path)]).toEqual([asset, file]);
  });
});

describe("bridge requests", () => {
  test.each(bridge.requests as [unknown, string | null][])("%j → %p", (request, error) => {
    expect(validateRequest(request)).toBe(error);
  });
  test.each(bridge.declarations as [unknown, string, string | null, boolean][])(
    "declaration %j lets %s %s through: %p",
    (decl, method, event, expected) => {
      expect(declares(decl, method, event)).toBe(expected);
    },
  );
  test.each(bridge.documents as [string | null, string[], string | null, string][])(
    "current %j, ended %j, request %j → %s",
    (current, ended, requested, expected) => {
      expect(admitDocument(current, ended, requested) as string).toBe(expected);
    },
  );
});

describe("ACL loading and checks (fail-closed)", () => {
  test.each(
    (acl.cases as { acl?: unknown; problem: boolean; checks: [string, string, number, boolean, unknown][] }[]).map(
      (c, i) => [i, c] as const,
    ),
  )("case %d", (_i, c) => {
    const { acl: loaded, problem } = loadAcl(c);
    expect(problem !== null).toBe(c.problem);
    for (const [plugin, item, window, allowed, scope] of c.checks) {
      const access = aclCheck(loaded, plugin, item, window);
      expect([plugin, item, window, access.allowed, access.scope ?? null] as unknown[]).toEqual([
        plugin,
        item,
        window,
        allowed,
        scope,
      ]);
    }
  });
});

describe("retained events", () => {
  test.each(
    (retained.cases as { name: string; ops: [string, string, boolean?][]; log: string[] }[]).map(
      (c) => [c.name, c] as const,
    ),
  )("%s", (_name, c) => {
    const events = new RetainedEvents<string>();
    const log: string[] = [];
    for (const [op, a, b] of c.ops) {
      if (op === "listen") events.listen(a, (v) => (b ? (log.push(`${a}:${v}`), true) : false));
      else if (op === "unlisten") events.unlisten(a);
      else events.emit(a, b === true);
    }
    expect(log).toEqual(c.log);
  });
});

describe("navigation", () => {
  test.each(navigation.cases as [string, boolean, string[], string][])(
    "%j top=%p extra=%j → %s",
    (url, top, extra, expected) => {
      expect(decideNavigation(url, top, "app://localhost", extra) as string).toBe(expected);
    },
  );
  test.each(navigation.fileRefSandbox as [string, boolean][])("a %j FileRef is sandboxed: %p", (mime, expected) => {
    expect(fileRefSandboxed(mime)).toBe(expected);
  });
});

// Ed25519 as the desktop verifies web bundle updates (Bun's node:crypto); Swift (CryptoKit) and Kotlin
// (AkanNativeEd25519 below API 33) run the same cases (scripts/native-vectors.ts, the device self-test).
const ed25519 = (await load("ed25519")) as { cases: [string, string, string, boolean, string][] };
describe("ed25519 vectors", () => {
  const { cases } = ed25519;
  test.each(cases)("%#: %s … → %p (%s)", (key, message, signature, valid) => {
    const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(key, "hex")]);
    const ok = cryptoVerify(
      null,
      Buffer.from(message, "hex"),
      createPublicKey({ key: spki, format: "der", type: "spki" }),
      Buffer.from(signature, "hex"),
    );
    expect(ok).toBe(valid);
  });
});
