//? A desktop app's shell runs the server it carries as Bun only while BUN_BE_BUN=1 is set, and a variable left in
//? process.env reaches every child: a `bun build --compile` tool in the app's bin would start as the Bun CLI instead
//? of itself. Only a spawn of this same executable gets it back.
export class SelfExec {
  static #beBun: string | undefined;

  static adopt() {
    const value = process.env.BUN_BE_BUN;
    if (value === undefined) return;
    SelfExec.#beBun = value;
    delete process.env.BUN_BE_BUN;
  }

  static env(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    return SelfExec.#beBun === undefined ? env : { ...env, BUN_BE_BUN: SelfExec.#beBun };
  }

  //? The runtime flags this process started with (a carried server's --no-env-file, --use-system-ca, …) go along too:
  //? the child runs in the same working folder, where they are what keeps a stray .env or bunfig.toml out.
  static command(script: string, ...args: string[]): string[] {
    return [process.execPath, ...process.execArgv, script, ...args];
  }
}
