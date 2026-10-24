export class BunVersionGuard {
  static refusal(bunVersion: string, range: string) {
    //? A range admits no prerelease of a later release (`1.4.5-canary.1`), so a canary build is judged by its release.
    if (Bun.semver.satisfies(bunVersion.replace(/-.*$/, ""), range)) return null;
    return `akan requires Bun ${range}, but this is Bun ${bunVersion}. Run \`bun upgrade\`, then try again.`;
  }
}
