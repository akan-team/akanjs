import { command, Workspace } from "@akanjs/devkit/commandDecorators";
import { VerifyScript } from "./verify.script";

const listOf = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export class VerifyCommand extends command("verify", [VerifyScript], ({ public: target }) => ({
  verify: target({
    desc: "Sync, lint, typecheck and build what changed, in one run, and print only what failed",
    stdio: true,
  })
    .arg("targets", String, {
      desc: "apps, libraries or packages to verify, comma-separated (default: whatever git reports as changed)",
      nullable: true,
    })
    .option("files", String, {
      flag: "F",
      desc: "verify these files only, comma-separated, instead of the git changes",
      nullable: true,
    })
    .option("lintOnly", Boolean, {
      flag: "l",
      desc: "lint only: skip sync, typecheck, build and the SSR check",
      default: false,
    })
    .option("build", Boolean, { flag: "b", desc: "build the changed apps once lint and typecheck pass", default: true })
    .option("max", Number, { flag: "m", desc: "diagnostic lines to print, 0 for all", default: 20 })
    .option("format", String, { flag: "f", desc: "output format", default: "text", enum: ["text", "json"] })
    .with(Workspace)
    .exec(async function (targets, files, lintOnly, build, max, format, workspace) {
      await this.verifyScript.verify(workspace, listOf(targets), {
        files: listOf(files),
        lintOnly,
        build,
        max,
        format: format === "json" ? "json" : "text",
      });
    }),
})) {}
