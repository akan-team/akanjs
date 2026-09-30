interface SelfExecGlobal {
  [key: symbol]: string | undefined;
}

//? A desktop app's shell runs the server it carries as Bun only while BUN_BE_BUN=1 is set, and a variable left in
//? process.env reaches every child: a `bun build --compile` tool in the app's bin would start as the Bun CLI instead
//? of itself. Only a spawn of this same executable gets it back.
export class SelfExec {
  //? Kept on globalThis: a built main.js and server.js each bundle a copy of this class, and main.js adopts.
  static readonly #key = Symbol.for("akan.selfExec.beBun");

  static get #beBun(): string | undefined {
    return (globalThis as unknown as SelfExecGlobal)[SelfExec.#key];
  }

  static adopt() {
    const value = process.env.BUN_BE_BUN;
    if (value === undefined) return;
    (globalThis as unknown as SelfExecGlobal)[SelfExec.#key] = value;
    delete process.env.BUN_BE_BUN;
  }

  /** A desktop app's carried server: only its shell starts the app executable as Bun. */
  static get carried(): boolean {
    return SelfExec.#beBun !== undefined;
  }

  static env(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    const beBun = SelfExec.#beBun;
    return beBun === undefined ? env : { ...env, BUN_BE_BUN: beBun };
  }

  //? The runtime flags this process started with (a carried server's --no-env-file, --use-system-ca, …) go along too:
  //? the child runs in the same working folder, where they are what keeps a stray .env or bunfig.toml out.
  static command(script: string, ...args: string[]): string[] {
    return [process.execPath, ...process.execArgv, script, ...args];
  }
}
