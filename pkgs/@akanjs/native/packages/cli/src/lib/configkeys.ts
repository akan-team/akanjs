// The keys an app config may have (config.ts), so that a misspelled or renamed key is an error
// instead of a setting that silently does nothing. `true` accepts any value (a leaf, or a map the
// app fills, like usageDescriptions). An object lists the keys of a value that is an object; a value
// of another type (icon as a string) is not checked here. "[]" is the shape of a list's object items.

type Shape = true | { readonly [key: string]: Shape };

const KNOWN: Shape = {
  app: { id: true, name: true, fileName: true, version: true, build: true },
  web: { dir: true, build: true, base: true, devEntry: true },
  plugins: true,
  capabilities: {
    "[]": {
      identifier: true,
      description: true,
      windows: true,
      platforms: true,
      permissions: { "[]": { identifier: true, allow: true, deny: true } },
    },
  },
  env: { defaults: true, platforms: { web: true, macos: true, windows: true, linux: true, ios: true, android: true } },
  shell: { backgroundColor: true, backgroundColorDark: true },
  usageDescriptions: true,
  privacy: { tracking: true, trackingDomains: true, collectedDataTypes: true, accessedApis: true },
  permissions: { camera: true, microphone: true, location: true },
  updates: { url: true, publicKey: true, channel: true, readyTimeout: true },
  deepLinks: { schemes: true, domains: { "[]": { host: true, pathPrefixes: true } } },
  native: {
    ios: { infoPlist: true, entitlements: true },
    macos: { entitlements: true },
    android: { manifest: true, application: true, activity: true },
    resources: { "[]": { from: true, to: true } },
  },
  security: { csp: true, shell: { externalSchemes: true } },
  android: { minWebViewVersion: true, debugAppIdSuffix: true, googleServices: true, autoplay: true },
  desktop: {
    quitOnLastWindowClosed: true,
    recovery: true,
    window: { fullscreen: true, skipTaskbar: true },
    screenCapture: true,
    server: { dir: true, entry: true, env: true },
    bin: true,
  },
  keyboard: { resize: true },
  push: {
    android: { channel: { id: true, name: true, importance: true, description: true }, smallIcon: true, color: true },
  },
  ios: { hideFormAccessoryBar: true },
  icon: { image: true, backgroundColor: true },
  splash: { backgroundColor: { light: true, dark: true }, image: true, autoHide: true, timeout: true },
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}

/** The known key a misspelled one probably meant: the same key in other case, else one at most two edits away. */
function suggestion(key: string, known: string[]): string | undefined {
  const lower = key.toLowerCase();
  return (
    known.find((k) => k.toLowerCase() === lower) ??
    known.filter((k) => distance(k.toLowerCase(), lower) <= 2).sort((a, b) => distance(a, key) - distance(b, key))[0]
  );
}

/** "unknown key deepLink (did you mean deepLinks?)" for every key the config should not have. */
export function unknownConfigKeys(config: unknown): string[] {
  const problems: string[] = [];
  const walk = (value: unknown, shape: Shape, path: string) => {
    if (shape === true) return;
    if (Array.isArray(value)) {
      const items = shape["[]"];
      if (items) for (const [i, item] of value.entries()) walk(item, items, `${path}[${i}]`);
      return;
    }
    if (!isObject(value)) return;
    const known = Object.keys(shape).filter((k) => k !== "[]");
    for (const [key, child] of Object.entries(value)) {
      const where = path ? `${path}.${key}` : key;
      const sub = shape[key];
      if (sub === undefined || key === "[]") {
        const hint = suggestion(key, known);
        problems.push(`unknown key ${where}${hint ? ` (did you mean ${path ? `${path}.` : ""}${hint}?)` : ""}`);
      } else walk(child, sub, where);
    }
  };
  walk(config, KNOWN, "");
  return problems;
}
