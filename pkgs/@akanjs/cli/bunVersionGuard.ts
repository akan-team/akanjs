export class BunVersionGuard {
  static refusal(bunVersion: string, range: string) {
    if (Bun.semver.satisfies(bunVersion, range)) return null;
    return `akan requires Bun ${range}, but this is Bun ${bunVersion}. Run \`bun upgrade\`, then try again.`;
  }
}
