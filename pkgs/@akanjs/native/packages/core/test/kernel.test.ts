import { describe, expect, test } from "bun:test";
import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";
import { stale } from "../../../scripts/contract.ts";
import { aclCheck, loadAcl } from "../src/acl.ts";
import { ID_BUNDLE, ID_DOCUMENT, ID_FILE_REF, ID_NAME } from "../src/contract.ts";
import {
  admitDocument,
  assetMime,
  checkUpdateEnvelope,
  decideNavigation,
  declares,
  fileMime,
  fileRefSandboxed,
  idValid,
  isChannelName,
  isHostPath,
  isStrictBase64,
  isUpdateKeyId,
  MAX_REVOKE_KEYS,
  MAX_UPDATE_MANIFEST,
  parseRange,
  RetainedEvents,
  route,
  UPDATE_REPORT_BATCH,
  UPDATE_REPORT_EVENTS,
  UPDATE_REPORT_LIMIT,
  UPDATE_REPORT_REASONS,
  type UpdateReportEvent,
  type UpdateReportReason,
  updateDecision,
  updateDecisionWire,
  updateManifestUrl,
  updateReportKey,
  updateReportOutcome,
  updateReportRetryAt,
  updateReportTime,
  updateReportWaits,
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

// Updates protocol v2 as the Swift and Kotlin shells decide it (AkanNativeKernel.updateDecision).
const updates = (await load("updates")) as {
  keyIds: [string, string][];
  decisions: [string[], string[], string, string[], boolean, number, number, [number, string] | null, string, string][];
  urls: [string, string, string, string, string][];
  envelopeKeys: string[];
  envelopes: [string | [string, number, string], string, string, string[], string, string][];
  limits: { revokeKeys: number; manifestBytes: number; reportEvents: number; reportBatch: number };
  reports: {
    events: string[];
    reasons: string[];
    outcomes: [number, string][];
    retryAfter: [string | null, number, number | null, string][];
    waits: [number | null, number, boolean][];
    keys: [UpdateReportEvent, string, UpdateReportReason | null, string][];
    times: [number, string][];
  };
};
const keyIdOf = (key: string) =>
  createHash("sha256").update(Buffer.from(key, "base64")).digest().subarray(0, 8).toString("hex");
describe("updates vectors", () => {
  test.each(updates.keyIds)("keyId of %s is %s", (publicKey, keyId) => {
    expect(keyIdOf(publicKey)).toBe(keyId);
  });
  test.each(updates.decisions)(
    "%#: %j %j signer %s revokes %j reset %p seq %d over %d running %j → %s (%s)",
    (ring, revoked, signer, revokeKeys, resetSequence, sequence, embedded, running, expected) => {
      const decision = updateDecision({
        ring,
        revoked,
        signer,
        revokeKeys,
        resetSequence,
        sequence,
        embedded,
        running: running && { sequence: running[0], keyId: running[1] },
      });
      expect(updateDecisionWire(decision)).toBe(expected);
    },
  );
  test.each(updates.urls)("%s %s %s %s → %s", (url, platform, channel, nativeApi, expected) => {
    expect(updateManifestUrl(url, platform, channel, nativeApi)).toBe(expected);
  });
  const keys = new Map(updates.envelopeKeys.map((key) => [keyIdOf(key), key]));
  const verify = (manifest: Uint8Array, signature: Uint8Array, keyId: string) => {
    const key = keys.get(keyId);
    if (!key) return false;
    const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(key, "base64")]);
    return cryptoVerify(null, manifest, createPublicKey({ key: spki, format: "der", type: "spki" }), signature);
  };
  test.each(updates.envelopes)("%#: envelope → %s (%s)", (field, keyId, signature, revoked, expected) => {
    const manifest = typeof field === "string" ? field : field[0].repeat(field[1]) + field[2];
    const opened = checkUpdateEnvelope({ manifest, keyId, signature }, [...keys.keys()], revoked, verify);
    expect(opened.verdict).toBe(expected as typeof opened.verdict);
    if (opened.verdict === "open") expect(opened.manifest).toEqual(new Uint8Array(Buffer.from(manifest, "base64")));
  });
  test("limits", () => {
    expect({
      revokeKeys: MAX_REVOKE_KEYS,
      manifestBytes: MAX_UPDATE_MANIFEST,
      reportEvents: UPDATE_REPORT_LIMIT,
      reportBatch: UPDATE_REPORT_BATCH,
    }).toEqual(updates.limits);
  });
  const { reports } = updates;
  test("report vocabulary", () => {
    expect(reports.events).toEqual([...UPDATE_REPORT_EVENTS]);
    expect(reports.reasons).toEqual([...UPDATE_REPORT_REASONS]);
  });
  test.each(reports.outcomes)("an answer of %d → %s", (status, expected) => {
    expect(updateReportOutcome(status)).toBe(expected as ReturnType<typeof updateReportOutcome>);
  });
  test.each(reports.retryAfter)("Retry-After %j at %d → %p (%s)", (header, now, expected) => {
    expect(updateReportRetryAt(header, now)).toBe(expected);
  });
  test.each(reports.waits)("retryAt %p at %d waits: %p", (retryAt, now, expected) => {
    expect(updateReportWaits(retryAt, now)).toBe(expected);
  });
  test.each(reports.keys)("%s %s %p → %s", (event, bundle, reason, expected) => {
    expect(updateReportKey(event, bundle, reason)).toBe(expected);
  });
  test.each(reports.times)("%d → %s", (ms, expected) => {
    expect(updateReportTime(ms)).toBe(expected);
  });
  test("strict base64 is what iOS decodes, and nothing Android or Java would take beside it", () => {
    for (const s of ["", "YQ==", "YWI=", "YWJj", "+/+/"]) expect(isStrictBase64(s)).toBe(true);
    for (const s of ["YQ", "YQ=", "YQ===", "Y\nQ==", " YQ==", "YQ== ", "=YQ=", "Y=Q=", "-_-_", "YWJ\u00e9"])
      expect(isStrictBase64(s)).toBe(false);
  });
});

// What the publisher writes and a desktop app's setChannel() takes: one rule, so no device waits on a channel nobody
// can publish to.
describe("update names", () => {
  test.each([
    ["production", true],
    ["pilot", true],
    ["beta-2", true],
    ["v1.2", true],
    ["a_b", true],
    ["x".repeat(41), true],
    ["x".repeat(42), false],
    ["Pilot", false],
    ["", false],
    [".hidden", false],
    ["-x", false],
    ["../stable", false],
    ["a/b", false],
    ["a\\b", false],
    ["bundle", false],
    ["manifest.template", false],
    ["compat", false],
    ["pack", false],
    ["files", false],
    ["app", false],
  ] as const)("channel %j: %p", (name, valid) => {
    expect(isChannelName(name)).toBe(valid);
  });
  test.each([
    ["4bb06f8e4e3a7715", true],
    ["4BB06F8E4E3A7715", false],
    ["4bb06f8e4e3a771", false],
    ["4bb06f8e4e3a77150", false],
    ["4bb06f8e4e3a771g", false],
  ] as const)("keyId %j: %p", (keyId, valid) => {
    expect(isUpdateKeyId(keyId)).toBe(valid);
  });
});
