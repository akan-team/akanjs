const partsOf = (path: string) => path.split("/").filter(Boolean);

export class PressLoading {
  //? `NEW_ROUTE_LEVEL_WAIT_MS`'s reasoning: an answer inside it draws no fallback, and React holds a shown one 300 ms.
  static readonly defaultDelayMs = 150;

  //? Read from the last segment back: a URL may hide the pattern's first ones (the locale, a host's base path) or lead
  //? with a prefix it lacks. `lang` counts as fixed, since every layout above the page reads it.
  static staysOnPage(pattern: string, shadowedBy: string[], from: string, to: string): boolean {
    const fromParts = partsOf(new URL(from).pathname);
    const toParts = partsOf(new URL(to).pathname);
    if (fromParts.length !== toParts.length) return false;
    const patternParts = partsOf(pattern);
    const offset = patternParts.length - toParts.length;
    let moved = false;
    for (let index = 0; index < toParts.length; index++) {
      if (fromParts[index] === toParts[index]) continue;
      const part = patternParts[index + offset];
      if (!part?.startsWith(":") || part === ":lang") return false;
      moved = true;
    }
    if (!moved) return false;
    return !shadowedBy.some((shadow) => {
      const shadowParts = partsOf(shadow);
      return toParts.every((value, index) => {
        const part = shadowParts[index + offset];
        return part === undefined || part.startsWith(":") || part === value;
      });
    });
  }
}
