export class SecretEnvName {
  //? What the database adaptor and the util lib's JWT secret already read from the process env, ahead of the env file.
  static readonly #existing: { readonly [path: string]: string } = {
    "security.jwtSecret": "JWT_SECRET",
    "database.postgres.url": "POSTGRES_URL",
    "database.postgres.password": "POSTGRES_PASSWORD",
    "database.postgres.insightUrl": "POSTGRES_INSIGHT_URL",
  };
  //? Kubernetes sets HOSTNAME to the pod's name, and a shell, Docker or Bun the rest: a secret read there takes theirs.
  static readonly #platform = new Set(["PATH", "HOME", "HOSTNAME", "PORT", "USER", "PWD", "TZ", "NODE_ENV"]);

  static of(keys: readonly string[]): string {
    return SecretEnvName.#existing[keys.join(".")] ?? keys.map((key) => SecretEnvName.#segment(key)).join("__");
  }

  static #segment(key: string) {
    return key
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^A-Za-z0-9]/g, "_")
      .toUpperCase();
  }

  static refusal(name: string): string | null {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) return "which is not a name an environment variable can take";
    if (SecretEnvName.#platform.has(name)) return "a variable the platform sets";
    if (/^(?:AKAN|BUN)_/.test(name)) return "a name akan and Bun keep for their own settings";
    return null;
  }
}
