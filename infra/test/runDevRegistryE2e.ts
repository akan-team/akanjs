import path from "node:path";
import { CsrE2eHarness } from "../../pkgs/@akanjs/devkit/csrE2e/csrE2eHarness.fixture";

/**
 * Runs the dev registry browser suites (`pkgs/@akanjs/devkit/csrE2e`) as CI does, after checking the host.
 *
 *   bun run testDevRegistryE2e
 *
 * The exit code keeps a host that cannot run them apart from a regression:
 *   0  the suites passed
 *   1  a suite failed
 *   2  this Bun is not the one the root package.json pins (`engines.bun`): a pass would say nothing about the Bun the
 *      repo is tested with, so a Bun upgrade moves the pin and the host together
 *   3  the host cannot drive a browser (`Bun.WebView`): nothing ran, and the line above says what is missing
 */
class DevRegistryE2eRun {
  static readonly #root = path.resolve(import.meta.dir, "../..");
  static readonly #devkit = path.join(DevRegistryE2eRun.#root, "pkgs/@akanjs/devkit");

  async run(): Promise<number> {
    const pinned = await this.#pinnedBun();
    console.info(`[dev-registry-e2e] Bun ${Bun.version} on ${process.platform}; the repo pins ${pinned ?? "none"}`);
    if (pinned !== Bun.version) {
      console.error(
        `[dev-registry-e2e] FAILED before running: this host runs Bun ${Bun.version} and package.json pins ${pinned ?? "none"} (engines.bun). Install the pinned one (curl -fsSL https://bun.sh/install | bash -s "bun-v${pinned}"), or move the pin in the change that upgrades Bun.`,
      );
      return 2;
    }
    const missing = await CsrE2eHarness.preflight();
    if (missing) {
      console.error(`[dev-registry-e2e] SKIPPED, environment not ready: ${missing}`);
      return 3;
    }
    const proc = Bun.spawn(["bun", "test", "--isolate", path.join(DevRegistryE2eRun.#devkit, "csrE2e")], {
      cwd: DevRegistryE2eRun.#devkit,
      env: { ...process.env, AKAN_CSR_E2E: "1" },
      stdio: ["inherit", "inherit", "inherit"],
    });
    return (await proc.exited) === 0 ? 0 : 1;
  }

  async #pinnedBun(): Promise<string | null> {
    const pkg = (await Bun.file(path.join(DevRegistryE2eRun.#root, "package.json")).json()) as {
      engines?: { bun?: string };
    };
    return pkg.engines?.bun ?? null;
  }
}

process.exit(await new DevRegistryE2eRun().run());
