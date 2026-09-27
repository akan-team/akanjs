import { CliError } from "./log.ts";

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | true>;
}

/** Parses `a b --flag value --bool --key=value`. A flag followed by another flag or nothing is boolean. */
export function parseArgs(argv: string[], booleanFlags: readonly string[] = []): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
    } else if (booleanFlags.includes(body) || i + 1 >= argv.length || argv[i + 1]!.startsWith("--")) {
      flags[body] = true;
    } else {
      flags[body] = argv[++i]!;
    }
  }
  return { positional, flags };
}

/** Rejects flags a command does not know (a typo would otherwise be ignored, e.g. --relase). */
export function checkFlags(args: ParsedArgs, known: readonly string[], usage: string): void {
  const unknown = Object.keys(args.flags).filter((f) => !known.includes(f));
  if (unknown.length)
    throw new CliError(
      `unknown flag${unknown.length > 1 ? "s" : ""} ${unknown.map((f) => `--${f}`).join(", ")}\nusage: ${usage}`,
      2,
    );
}

export function stringFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}
