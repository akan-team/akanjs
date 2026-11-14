import path from "node:path";
import type { WorkspaceExecutor } from "../../executors";
import type { AkanSysContext } from "../akanContext";
import { safeReadText } from "../safeRead";
import type { DoctorFindings } from "./doctorFindings";

export class ConfigLeftoverCheck {
  static async run(workspace: WorkspaceExecutor, systems: AkanSysContext[], findings: DoctorFindings) {
    const sysPaths = systems.map((sys) => sys.path);
    for (const leftover of await ConfigLeftoverCheck.#leftovers(workspace, sysPaths))
      findings.push({ severity: "warning", code: "config-leftover", ...leftover });
  }

  //? Older templates wrote these for Next.js: nothing installs or reads them, and editors warn about the plugin.
  static async #leftovers(workspace: WorkspaceExecutor, sysPaths: string[]) {
    const leftovers: { path: string; message: string }[] = [];
    for (const sysPath of sysPaths) {
      const tsconfigPath = `${sysPath}/tsconfig.json`;
      const tsconfig = await safeReadText(path.join(workspace.workspaceRoot, tsconfigPath));
      if (tsconfig && (/"name"\s*:\s*"next"/.test(tsconfig) || tsconfig.includes(".next/types")))
        leftovers.push({
          path: tsconfigPath,
          message: `${tsconfigPath} still names the Next.js TS plugin or .next/types, which Akan never uses — delete the "next" plugin entry and the ".next/types/**/*.ts" include.`,
        });
    }
    const bunfig = await safeReadText(path.join(workspace.workspaceRoot, "bunfig.toml"));
    if (bunfig?.includes("bun-plugin-tailwind"))
      leftovers.push({
        path: "bunfig.toml",
        message:
          "bunfig.toml still loads bun-plugin-tailwind, which is not installed and which Akan never uses (it compiles Tailwind itself) — delete the [serve.static] section, which Akan never reads.",
      });
    return leftovers;
  }
}
