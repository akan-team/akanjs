import { describe, expect, test } from "bun:test";
import path from "node:path";
import { AgentAssets } from "./agentAssets";
import { ErrorCodeReference } from "./errorCodeReference";
import type { ErrorCodeRow } from "./errorCodeScan";
import { tempDirs, writeText } from "./testHelpers";

const akanjsDir = path.resolve(import.meta.dir, "../../akanjs");
const target = ErrorCodeReference.target(path.resolve(import.meta.dir, "../cli"));
const makeTempRoot = tempDirs("akan-error-codes-");

const git = (root: string, args: string[]) => {
  const run = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
};

const fixtureOf = async (files: Record<string, string>, untracked: Record<string, string> = {}) => {
  const root = await makeTempRoot();
  const akanError = await Bun.file(path.join(akanjsDir, "base/akanError.ts")).text();
  await writeText(path.join(root, "base/akanError.ts"), akanError);
  for (const [file, content] of Object.entries(files)) await writeText(path.join(root, file), content);
  git(root, ["init", "-q"]);
  git(root, ["add", "."]);
  for (const [file, content] of Object.entries(untracked)) await writeText(path.join(root, file), content);
  return root;
};

const statusError = `import { AkanError } from "../base/akanError";
export class StatusError extends AkanError {
  constructor(statusCode: number, message: string) {
    super(AkanError.codeOfStatus(statusCode), message, { statusCode });
  }
  override get forwarded() {
    return true;
  }
  override toJSON() {
    return { error: this.message, statusCode: this.statusCode };
  }
  static NotFound = class NotFoundError extends StatusError {
    constructor(message = "Not Found") {
      super(404, message);
    }
  };
}
`;

const rowOf = (row: Partial<ErrorCodeRow> & Pick<ErrorCodeRow, "error" | "file">): ErrorCodeRow => ({
  code: null,
  byStatus: false,
  statusCode: 500,
  forwarded: false,
  wire: true,
  ...row,
});

describe("ErrorCodeReference", () => {
  const rendered = ErrorCodeReference.render(akanjsDir);

  test("the committed guideline matches the akanjs sources; regenerate with bun run error:codes", async () => {
    expect(await Bun.file(target).text()).toBe(rendered);
  });

  test("fits one skill reference part", () => {
    expect(AgentAssets.split(rendered)).toHaveLength(1);
    expect(rendered.length).toBeLessThanOrEqual(AgentAssets.referenceLimit);
  });

  test("reads a literal code, a union through a conditional, a status class, options a subclass passes on and each status an error is built with", async () => {
    const root = await fixtureOf({
      "server/quotaError.ts": `import { AkanError } from "../base/akanError";
export class QuotaError extends AkanError<"quotaExceeded"> {
  constructor(message = "") {
    super("quotaExceeded", message, { statusCode: 429 });
  }
}
`,
      "server/inputError.ts": `import { AkanError } from "../base/akanError";
export class InputError extends AkanError<"missingInput" | "invalidInput"> {
  constructor(expected: string | null) {
    super(expected ? "invalidInput" : "missingInput", "input", { statusCode: 400 });
  }
}
`,
      "server/jobError.ts": `import { AkanError } from "../base/akanError";
export type JobErrorCode = "stalled" | "lost";
export class JobError extends AkanError<JobErrorCode> {
  constructor(code: JobErrorCode, message: string, options?: { cause?: unknown }) {
    super(code, message, options);
  }
}
`,
      "server/passError.ts": `import { AkanError } from "../base/akanError";
export class PassError extends AkanError {
  constructor(code: string, options?: { statusCode?: number }) {
    super(code, "pass", options);
  }
}
`,
      "signal/statusError.ts": statusError,
      "signal/use.ts": `import { AkanError } from "../base/akanError";
import { PassError } from "../server/passError";
import { StatusError } from "./statusError";
export const fail = (busy: boolean) => {
  if (busy) throw new StatusError(503, "busy");
  throw new AkanError("plain", "plain", { statusCode: 418 });
};
export const pass = (missing: boolean) => {
  if (missing) throw new PassError("passed", { statusCode: 404 });
  throw new PassError("defaulted");
};
export const relay = (code: string) => new PassError(code, { statusCode: 400 });
export const answer = (status: number) => new StatusError(status, "answered");
`,
      "signal/use.test.ts": `import { StatusError } from "./statusError";
throw new StatusError(409, "only in a test");
`,
    });

    expect(ErrorCodeReference.collect(root)).toEqual([
      rowOf({ code: "defaulted", error: "PassError", file: "server/passError.ts" }),
      rowOf({ code: "invalidInput", statusCode: 400, error: "InputError", file: "server/inputError.ts" }),
      rowOf({ code: "lost", error: "JobError", file: "server/jobError.ts" }),
      rowOf({ code: "missingInput", statusCode: 400, error: "InputError", file: "server/inputError.ts" }),
      rowOf({
        code: "notFound",
        statusCode: 404,
        error: "StatusError.NotFound",
        forwarded: true,
        wire: false,
        file: "signal/statusError.ts",
      }),
      rowOf({ code: "passed", statusCode: 404, error: "PassError", file: "server/passError.ts" }),
      rowOf({ code: "plain", statusCode: 418, error: "AkanError", file: "base/akanError.ts" }),
      rowOf({ code: "quotaExceeded", statusCode: 429, error: "QuotaError", file: "server/quotaError.ts" }),
      rowOf({
        code: "serviceUnavailable",
        statusCode: 503,
        error: "StatusError",
        forwarded: true,
        wire: false,
        file: "signal/statusError.ts",
      }),
      rowOf({ code: "stalled", error: "JobError", file: "server/jobError.ts" }),
      rowOf({ statusCode: 400, error: "PassError", file: "server/passError.ts" }),
      rowOf({
        byStatus: true,
        statusCode: null,
        error: "StatusError",
        forwarded: true,
        wire: false,
        file: "signal/statusError.ts",
      }),
    ]);
    const page = ErrorCodeReference.render(root);
    expect(page).toContain("| set when thrown | 400 | `PassError` |");
    expect(page).toContain("| by status | set when thrown | `StatusError` |");
  });

  test("reads the tracked package sources the gate measures, through classes that name no AkanError", async () => {
    const root = await fixtureOf(
      {
        "signal/statusError.ts": statusError,
        "server/wideError.ts": `import { StatusError } from "../signal/statusError";
export class WideError<T extends { id: string } = { id: string }> extends StatusError {
  constructor(statusCode: number, readonly item: T) {
    super(statusCode, "wide");
  }
}
`,
        "server/useWide.ts": `import { WideError } from "./wideError";
export const clash = () => new WideError(409, { id: "a" });
`,
        "examples/demo.ts": `import { StatusError } from "../signal/statusError";
export const demo = () => new StatusError(413, "an example");
`,
        "server/demo.fixture.ts": `import { StatusError } from "../signal/statusError";
export const fixture = () => new StatusError(401, "a fixture");
`,
      },
      {
        "server/scratch.ts": `import { StatusError } from "../signal/statusError";
export const scratch = () => new StatusError(502, "not committed");
`,
      },
    );

    expect(ErrorCodeReference.collect(root).map(({ code, error }) => `${code} ${error}`)).toEqual([
      "conflict WideError",
      "notFound StatusError.NotFound",
      "null StatusError",
    ]);
  });

  test("reads a forwarded getter that compares this.code to a literal per code", async () => {
    const root = await fixtureOf({
      "service/queryError.ts": `import { AkanError } from "../base/akanError";
export class QueryError extends AkanError<"badQuery" | "queryDown"> {
  constructor(code: "badQuery" | "queryDown") {
    super(code, "query", { statusCode: 400 });
  }
  override get forwarded() {
    return this.code !== "queryDown";
  }
}
`,
    });

    expect(ErrorCodeReference.collect(root).map(({ code, forwarded, wire }) => `${code} ${forwarded} ${wire}`)).toEqual(
      ["badQuery true true", "queryDown false true"],
    );
  });

  test("lists each code with the status its own code chooses", async () => {
    const root = await fixtureOf({
      "service/storeError.ts": `import { AkanError } from "../base/akanError";
export class StoreError extends AkanError<"badValue" | "missing" | "down"> {
  constructor(code: "badValue" | "missing" | "down", message: string) {
    super(code, message, { statusCode: code === "badValue" ? 400 : 500 });
  }
}
`,
      "service/tableError.ts": `import { AkanError } from "../base/akanError";
type TableCode = "slow" | "refused";
export class TableError extends AkanError<TableCode> {
  static readonly #statuses: Record<TableCode, number> = { slow: 504, refused: 400 };
  constructor(code: TableCode, message: string) {
    super(code, message, { statusCode: TableError.#statuses[code] });
  }
}
`,
    });

    expect(
      ErrorCodeReference.collect(root).map(({ code, statusCode, error }) => `${code} ${statusCode} ${error}`),
    ).toEqual([
      "badValue 400 StoreError",
      "down 500 StoreError",
      "missing 500 StoreError",
      "refused 400 TableError",
      "slow 504 TableError",
    ]);
  });

  test("refuses a forwarded getter it cannot read as a literal", async () => {
    const root = await fixtureOf({
      "server/flagError.ts": `import { AkanError } from "../base/akanError";
export class FlagError extends AkanError<"flagged"> {
  constructor(readonly relayed: boolean) {
    super("flagged", "flag");
  }
  override get forwarded() {
    return this.relayed;
  }
}
`,
    });

    expect(() => ErrorCodeReference.collect(root)).toThrow(
      "FlagError's forwarded getter returns more than a literal true or false",
    );
  });
});
