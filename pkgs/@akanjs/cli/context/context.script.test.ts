import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import { AppExecutor } from "@akanjs/devkit/executors";
import { NativeApp } from "@akanjs/devkit/mobile";
import { createTempApp, tempRoots, writeText } from "@akanjs/devkit/testHelpers";
import { Logger } from "akanjs/common";
import { ContextScript } from "./context.script";

afterEach(() => CommandContainer.clear());
const track = tempRoots();

const runDoctor = async (
  workspace: Parameters<ContextScript["doctor"]>[0],
  options: Parameters<ContextScript["doctor"]>[1],
) => {
  const printed = spyOn(Logger, "rawLog").mockImplementation(() => undefined);
  const exitCode = process.exitCode;
  try {
    process.exitCode = 0;
    await CommandContainer.get(ContextScript).doctor(workspace, options);
    return { exitCode: process.exitCode, output: String(printed.mock.calls[0]?.[0]) };
  } finally {
    printed.mockRestore();
    //? Bun ignores `process.exitCode = undefined`, so restoring an unset code needs the 0.
    process.exitCode = exitCode ?? 0;
  }
};

describe("ContextScript.doctor", () => {
  test("exits 1 when the report it prints is failed, in json and text, and 0 when it passed", async () => {
    const { workspace, app } = track(await createTempApp("demo"));
    for (const facet of ["constant", "dictionary", "service", "store", "signal"])
      await writeText(`${app.cwdPath}/lib/post/post.${facet}.ts`, "export {};\n");

    const strictJson = await runDoctor(workspace, { format: "json", strict: true });
    expect(JSON.parse(strictJson.output)).toMatchObject({ status: "failed", strict: true });
    expect(strictJson.exitCode).toBe(1);

    const strictText = await runDoctor(workspace, { format: "text", strict: true });
    expect(strictText.output).toContain("Akan doctor status: failed");
    expect(strictText.exitCode).toBe(1);

    const loose = await runDoctor(workspace, { format: "json" });
    expect(JSON.parse(loose.output)).toMatchObject({
      status: "passed",
      diagnostics: [{ code: "module-abstract-missing", severity: "warning" }],
    });
    expect(loose.exitCode).toBe(0);

    await writeText(`${app.cwdPath}/stray/stray.ts`, "export {};\n");
    const looseError = await runDoctor(workspace, { format: "text" });
    expect(looseError.output).toContain("Akan doctor status: failed");
    expect(looseError.exitCode).toBe(1);
  });

  test("exits 1 when the iOS report is failed, and 0 when it only warns", async () => {
    const { workspace } = track(await createTempApp("demo"));
    const config = spyOn(AppExecutor.prototype, "getConfig").mockResolvedValue({
      hasNativeConfig: true,
      native: { targets: {} },
    } as never);
    const check = { group: "iOS", name: "Xcode", detail: "not found", hint: "Install Xcode.", fixable: false };
    const nativeDoctor = spyOn(NativeApp, "doctor");
    try {
      nativeDoctor.mockResolvedValue({ ok: false, checks: [{ ...check, ok: false, warn: false }] });
      const failed = await runDoctor(workspace, { format: "json", ios: true });
      expect(JSON.parse(failed.output)).toMatchObject({ kind: "ios", status: "failed" });
      expect(failed.exitCode).toBe(1);

      nativeDoctor.mockResolvedValue({ ok: true, checks: [{ ...check, ok: true, warn: true }] });
      const warned = await runDoctor(workspace, { format: "text", ios: true });
      expect(warned.output).toContain("[warning] native-toolchain");
      expect(warned.exitCode).toBe(0);
    } finally {
      config.mockRestore();
      nativeDoctor.mockRestore();
    }
  });
});
