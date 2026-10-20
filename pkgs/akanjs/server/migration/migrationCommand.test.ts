import { describe, expect, test } from "bun:test";
import { MigrationCommand } from "./migrationCommand";
import { MigrationError } from "./migrationError";
import type { MigrationRunner } from "./migrationRunner";

describe("MigrationCommand", () => {
  test("parses an action, its target and repeated params; list is the default", () => {
    expect(MigrationCommand.parse([])).toMatchObject({ action: "list", target: "", params: {}, json: false });
    expect(
      MigrationCommand.parse([
        "apply",
        "202610211000_owner",
        "--param",
        "shared=primary",
        "--param",
        "note=a=b",
        "--expect",
        "abc",
        "--actor",
        "u1",
        "--json",
      ]),
    ).toEqual({
      action: "apply",
      target: "202610211000_owner",
      params: { shared: "primary", note: "a=b" },
      expect: "abc",
      actor: "u1",
      items: undefined,
      json: true,
    });
    expect(MigrationCommand.parse(["plan", "x", "--items", "0"]).items).toBe(0);
  });

  test("refuses what no action takes, as a usage error", () => {
    const usage = (argv: string[]) => {
      try {
        MigrationCommand.parse(argv);
      } catch (error) {
        return MigrationError.codeOf(error);
      }
      return null;
    };
    expect(usage(["upgrade"])).toBe("usage");
    expect(usage(["apply"])).toBe("usage");
    expect(usage(["list", "x"])).toBe("usage");
    expect(usage(["plan", "x", "y"])).toBe("usage");
    expect(usage(["plan", "x", "--param", "noValue"])).toBe("usage");
    expect(usage(["plan", "x", "--param", "__proto__=1"])).toBe("usage");
    expect(usage(["plan", "x", "--param", "a=1", "--param", "a=2"])).toBe("usage");
    expect(usage(["plan", "x", "--items", "-1"])).toBe("usage");
    expect(usage(["plan", "x", "--force"])).toBe("usage");
    expect(usage(["plan", "x", "--items", "1e3"])).toBe("usage");
    expect(usage(["apply", "x", "--items", "5"])).toBe("usage");
    expect(usage(["rollback", "x", "--param", "a=1"])).toBe("usage");
    expect(usage(["list", "--actor", "u1"])).toBe("usage");
  });

  test("names the command it was invoked as, and finds --json before parsing can fail", () => {
    expect(() => MigrationCommand.parse(["upgrade"], "akan migrate demo")).toThrow("  akan migrate demo plan <id>");
    expect(MigrationCommand.usageOf()).toContain("  ops migrate list [--json]");
    expect(MigrationCommand.jsonOf(["upgrade", "--json"])).toBe(true);
    expect(MigrationCommand.jsonOf(["list"])).toBe(false);
  });

  test("exits 0 when ok, 2 for a caller's mistake, 3 when verify finds problems, 1 for anything else", () => {
    const failure = (code: ConstructorParameters<typeof MigrationError>[0]) =>
      MigrationCommand.failure("apply", new MigrationError(code, "no"));
    expect(MigrationCommand.exitCode({ ok: true, action: "list" })).toBe(0);
    expect(MigrationCommand.exitCode(failure("invalidParam"))).toBe(2);
    expect(MigrationCommand.exitCode(failure("notFound"))).toBe(2);
    expect(MigrationCommand.exitCode(failure("locked"))).toBe(1);
    expect(MigrationCommand.exitCode(failure("alreadyApplied"))).toBe(1);
    expect(MigrationCommand.exitCode(failure("planChanged"))).toBe(1);
    expect(MigrationCommand.exitCode(failure("verifyFailed"))).toBe(3);
    expect(MigrationCommand.failure("plan", new Error("boom"))).toEqual({
      ok: false,
      action: "plan",
      code: "failed",
      error: "boom",
      runId: null,
    });
  });

  test("reports a verify that finds problems as verifyFailed, counting them", async () => {
    const verify = async (problems: string[]) => {
      const runner = { verify: async () => ({ id: "m", runId: "r1", problems }) } as unknown as MigrationRunner;
      return await MigrationCommand.run(runner, MigrationCommand.parse(["verify", "m"]));
    };
    expect(await verify([])).toEqual({ ok: true, action: "verify", id: "m", runId: "r1", problems: [] });
    expect(await verify(["a"])).toMatchObject({ ok: false, code: "verifyFailed", error: "1 problem remains" });
    expect(await verify(["a", "b"])).toMatchObject({ code: "verifyFailed", error: "2 problems remain" });
  });

  test("prints one JSON line with --json, and a list a person reads without it", () => {
    const result = {
      ok: true,
      action: "list" as const,
      migrations: [
        {
          id: "202610211000_owner",
          title: "Give every license an owner",
          checksum: "c",
          status: "applied",
          appliedRunId: "r1",
          appliedAt: 1,
          checksumMismatch: true,
          params: [
            { name: "shared", type: "one of duplicate, primary", required: false, default: "duplicate" },
            { name: "org", type: "ID", required: true },
          ],
        },
      ],
    };
    expect(MigrationCommand.render(result, true)).toBe(JSON.stringify(result));
    expect(MigrationCommand.render(result, false)).toBe(
      [
        "applied  202610211000_owner  Give every license an owner  (applied from another version of the script)",
        '         --param shared=<one of duplicate, primary> (default "duplicate")',
        "         --param org=<ID>",
      ].join("\n"),
    );
  });
});
