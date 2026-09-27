// akan-native signing setup | status (Q8 follow-up): a stable self-signed identity for macOS dev builds.

import { parseArgs } from "../lib/args.ts";
import { CliError, dim, log } from "../lib/log.ts";
import { devIdentity, setupSigning } from "../lib/signing.ts";

export const SIGNING_USAGE = "akan-native signing setup | akan-native signing status";

export async function signing(argv: string[]): Promise<number> {
  const [sub] = parseArgs(argv).positional;
  if (sub === "setup") {
    log.step("creating a code-signing identity in the login keychain (macOS asks for your password to trust it)");
    const { identity, created } = await setupSigning();
    log.ok(`${created ? "created" : "using"} "${identity.name}" (${identity.hash})`);
    log.info(
      dim(
        "macOS builds are signed with it from now on (AKAN_NATIVE_SIGNING=adhoc for ad-hoc). TCC grants and Keychain items survive rebuilds.",
      ),
    );
    return 0;
  }
  if (sub === "status" || sub === undefined) {
    const identity = await devIdentity();
    log.info(
      identity
        ? `macOS builds are signed with "${identity.name}" (${identity.hash})`
        : "macOS builds are ad-hoc signed (run `akan-native signing setup` for a stable identity)",
    );
    return 0;
  }
  throw new CliError(`usage: ${SIGNING_USAGE}`, 2);
}
