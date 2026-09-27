import { describe, expect, test } from "bun:test";
import { aclWarnings, manifestPermissionProblems, resolveAcl } from "../src/lib/acl.ts";
import type { PluginManifest, ResolvedPlugin } from "../src/lib/project.ts";

const manifest = (m: Partial<PluginManifest> & { id: string }): PluginManifest =>
  ({ apiVersion: 1, methods: [], events: [], ...m }) as PluginManifest;
const plugin = (m: PluginManifest): ResolvedPlugin => ({ spec: m.id, dir: "/x", manifest: m });

const fs = manifest({
  id: "filesystem",
  methods: ["readFile", "writeFile", "remove", "paths"],
  events: ["change"],
  permissionSets: {
    read: { permissions: ["allow-readFile", "allow-paths"] },
    rw: { permissions: ["read", "allow-writeFile"] },
  },
  scope: { fields: { base: "base directory", path: "glob relative to base" } },
});
const opener = manifest({
  id: "opener",
  methods: ["openUrl", "openSettings"],
  defaultPermissions: ["allow-openUrl"],
  scope: { fields: { url: "glob" } },
});
const win = manifest({ id: "window", methods: ["setTitle", "close"], events: ["resize"] });
const plugins = [fs, opener, win].map(plugin);

const problems = (fn: () => unknown): string => {
  try {
    fn();
    return "";
  } catch (error) {
    return (error as Error).message;
  }
};

describe("resolveAcl", () => {
  test("without capabilities: every plugin's default set in every window, plus core print", () => {
    expect(resolveAcl(undefined, plugins, "ios")).toEqual({
      grants: [
        { plugin: "filesystem", windows: "*", items: ["readFile", "writeFile", "remove", "paths", "listen:change"] },
        { plugin: "opener", windows: "*", items: ["openUrl"] },
        { plugin: "window", windows: "*", items: ["setTitle", "close", "listen:resize"] },
        { plugin: "core", windows: "*", items: ["print"] },
      ],
    });
  });

  test("identifiers, sets, windows, deny, scopes", () => {
    const acl = resolveAcl(
      [
        {
          identifier: "main",
          windows: ["main", 3],
          permissions: [
            "filesystem:rw",
            {
              identifier: "filesystem:allow-remove",
              allow: [{ base: "cache", path: "**" }],
              deny: [{ path: "keep/**" }],
            },
            "window:allow-listen-resize",
            "window:all",
          ],
        },
        {
          identifier: "everywhere",
          windows: ["*"],
          permissions: ["opener:default", "window:deny-close", "core:deny-print"],
        },
      ],
      plugins,
      "macos",
    );
    expect(acl).toEqual({
      grants: [
        { plugin: "filesystem", windows: [1, 3], items: ["readFile", "paths", "writeFile"] },
        {
          plugin: "filesystem",
          windows: [1, 3],
          items: ["remove"],
          allow: [{ base: "cache", path: "**" }],
          deny: [{ path: "keep/**" }],
        },
        { plugin: "window", windows: [1, 3], items: ["listen:resize"] },
        { plugin: "window", windows: [1, 3], items: ["setTitle", "close", "listen:resize"] },
        { plugin: "opener", windows: "*", items: ["openUrl"] },
        { plugin: "core", windows: "*", items: ["print"] },
      ],
      denied: { core: ["print"], window: ["close"] },
    });
  });

  test("platforms: a capability only for some platforms", () => {
    const caps = [
      { identifier: "mobile", platforms: ["ios" as const, "android" as const], permissions: ["opener:all"] },
    ];
    expect(resolveAcl(caps, plugins, "ios").grants[0]).toEqual({
      plugin: "opener",
      windows: "*",
      items: ["openUrl", "openSettings"],
    });
    expect(resolveAcl(caps, plugins, "web").grants).toEqual([{ plugin: "core", windows: "*", items: ["print"] }]);
  });

  test("every problem is reported, with suggestions", () => {
    const message = problems(() =>
      resolveAcl(
        [
          {
            identifier: "Bad Name",
            windows: ["side" as never],
            permissions: [
              "filesystem:allow-readfile",
              "filesytem:read",
              "opener:allow-open",
              "window:deny-listen-move",
              { identifier: "window:allow-setTitle", allow: [{ path: "x" }] },
              { identifier: "filesystem:deny-remove", deny: [{ path: "x" }] },
              { identifier: "filesystem:read", allow: [{ folder: "x" }] },
              "core:allow-everything",
              "nocolon",
            ],
          },
          { identifier: "dup", permissions: [] },
          { identifier: "dup", permissions: [] },
        ],
        plugins,
        "web",
      ),
    );
    for (const part of [
      'identifier must be lowercase letters, digits and "-" (got "Bad Name")',
      'windows entries are "main", "*" or window ids (got "side")',
      'filesystem has no method "readfile" (did you mean "readFile"?)',
      'plugin "filesytem" is not in the app\'s plugins (did you mean "filesystem"?)',
      'opener has no method "open" (did you mean "openUrl"?)',
      'window has no event "move"',
      "plugin window takes no scopes",
      "deny permissions take no scopes",
      'filesystem scopes have no field "folder" (fields: base, path)',
      "unknown permission core:allow-everything",
      'expected "<plugin>:<name>"',
      'capability "dup" is defined twice',
    ]) {
      expect(message).toContain(part);
    }
  });

  test("manifest checks: bad set names, cycles, unknown references, denies in defaults", () => {
    expect(manifestPermissionProblems(fs)).toEqual([]);
    expect(
      manifestPermissionProblems(
        manifest({ id: "a", methods: ["x"], permissionSets: { "allow-x": { permissions: [] } } }),
      )[0],
    ).toContain("invalid permission set name");
    expect(
      manifestPermissionProblems(
        manifest({ id: "a", methods: ["x"], permissionSets: { loop: { permissions: ["loop"] } } }),
      )[0],
    ).toContain("includes itself");
    expect(
      manifestPermissionProblems(manifest({ id: "a", methods: ["x"], defaultPermissions: ["allow-y"] }))[0],
    ).toContain('a has no method "y"');
    expect(
      manifestPermissionProblems(manifest({ id: "a", methods: ["x"], defaultPermissions: ["deny-x"] }))[0],
    ).toContain("may only allow");
    expect(manifestPermissionProblems(manifest({ id: "a", methods: ["x"], scope: { fields: {} } }))[0]).toContain(
      "scope must be",
    );
    expect(
      manifestPermissionProblems(manifest({ id: "a", methods: ["x"], defaultScope: { allow: [{ url: "*" }] } }))[0],
    ).toContain("takes no scopes");
    expect(manifestPermissionProblems({ ...fs, defaultScope: { allow: [{ folder: "x" }] } })[0]).toContain(
      'no field "folder"',
    );
  });

  // Architecture review 2026-09-26: a URL deny without a port covers every port, but only its scheme.
  test("aclWarnings: an https-only URL deny", () => {
    const http = plugin(
      manifest({ id: "http", methods: ["request"], scope: { fields: { url: "URL" }, urlFields: ["url"] } }),
    );
    const warn = (deny: { url: string }[]) =>
      aclWarnings(
        resolveAcl(
          [{ identifier: "main", permissions: [{ identifier: "http:allow-request", allow: [{ url: "*" }], deny }] }],
          [http],
          "ios",
        ),
        [http],
      );
    expect(warn([{ url: "https://internal.example.com/*" }])).toEqual([
      'http: the deny scope url "https://internal.example.com/*" only covers https://; write "*://internal.example.com/*" to deny every scheme',
    ]);
    expect(warn([{ url: "*://internal.example.com/*" }])).toEqual([]);
    expect(warn([{ url: "https://internal.example.com/*" }, { url: "http://internal.example.com/*" }])).toEqual([]);
    expect(
      manifestPermissionProblems(
        manifest({ id: "a", methods: ["x"], scope: { fields: { url: "URL" }, urlFields: ["uri"] } }),
      )[0],
    ).toContain("urlFields");
  });

  // The syntax before the architecture review fails the build with the fix.
  test("old scope syntax: URL patterns without a scheme, absolute or backslash paths", () => {
    const http = plugin(
      manifest({ id: "http", methods: ["request"], scope: { fields: { url: "URL" }, urlFields: ["url"] } }),
    );
    const files = plugin({ ...fs, scope: { fields: { base: "b", path: "p" }, pathFields: ["path"] } });
    const fails = (identifier: string, allow: Record<string, string>[], plugins = [http, files]) =>
      problems(() => resolveAcl([{ identifier: "main", permissions: [{ identifier, allow }] }], plugins, "ios"));
    expect(fails("http:allow-request", [{ url: "api.example.com/*" }])).toContain('write "https://api.example.com/*"');
    expect(fails("filesystem:allow-readFile", [{ path: "/notes/**" }])).toContain('write "notes/**"');
    expect(fails("filesystem:allow-readFile", [{ path: "notes\\a" }])).toContain('write "notes/a"');
    expect(fails("filesystem:allow-readFile", [{ path: "../x" }])).toContain('cannot contain ".."');
    expect(
      manifestPermissionProblems(manifest({ id: "a", methods: ["x"], scope: { fields: { url: "URL" } } }))[0],
    ).toContain("scope.urlFields");
    const warn = aclWarnings(
      resolveAcl(
        [
          {
            identifier: "main",
            permissions: [{ identifier: "http:allow-request", allow: [{ url: "http://localhost/*" }] }],
          },
        ],
        [http],
        "ios",
      ),
      [http],
    );
    expect(warn).toEqual([
      'http: the allow scope url "http://localhost/*" has no port, so only the default port; write "http://localhost:*/*" for any port',
    ]);
  });

  // Conservative defaults (user decision 2026-09-26): <plugin>:default carries the manifest's
  // defaultScope, with or without capabilities; a capability's allow replaces it, denies add up.
  test("defaultScope: scopes of <plugin>:default", () => {
    const scoped = [
      plugin({ ...fs, defaultScope: { allow: [{ base: "data" }], deny: [{ path: ".secrets/**" }] } }),
      plugin(
        manifest({ id: "http", methods: ["request"], scope: { fields: { url: "URL" } }, defaultScope: { allow: [] } }),
      ),
    ];
    expect(resolveAcl(undefined, scoped, "ios").grants.slice(0, 2)).toEqual([
      {
        plugin: "filesystem",
        windows: "*",
        items: ["readFile", "writeFile", "remove", "paths", "listen:change"],
        allow: [{ base: "data" }],
        deny: [{ path: ".secrets/**" }],
      },
      { plugin: "http", windows: "*", items: ["request"], allow: [] },
    ]);
    const acl = resolveAcl(
      [
        {
          identifier: "main",
          permissions: [
            { identifier: "filesystem:default", deny: [{ path: "private/**" }] },
            { identifier: "http:default", allow: [{ url: "https://api.example.com/*" }] },
            "filesystem:rw",
          ],
        },
      ],
      scoped,
      "ios",
    );
    expect(acl.grants.slice(0, 3)).toEqual([
      {
        plugin: "filesystem",
        windows: "*",
        items: ["readFile", "writeFile", "remove", "paths", "listen:change"],
        allow: [{ base: "data" }],
        deny: [{ path: ".secrets/**" }, { path: "private/**" }],
      },
      { plugin: "http", windows: "*", items: ["request"], allow: [{ url: "https://api.example.com/*" }] },
      { plugin: "filesystem", windows: "*", items: ["readFile", "paths", "writeFile"] },
    ]);
  });
});
