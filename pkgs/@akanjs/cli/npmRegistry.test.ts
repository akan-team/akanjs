import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Logger } from "akanjs/common";
import { LocalRegistryRunner } from "./localRegistry/localRegistry.runner";
import {
  akanReleasePackagesOf,
  getNpmRegistryUrl,
  getServedReleasePeers,
  npmRegistryFromEnv,
  warnIgnoredNpmRegistry,
} from "./npmRegistry";

const shellRegistry = "http://127.0.0.1:4900";

const inRepo = (dotenv: Record<string, string>, run: () => void) => {
  const repo = mkdtempSync(path.join(tmpdir(), "akan-npm-registry-"));
  const cwd = process.cwd();
  const had = process.env.AKAN_NPM_REGISTRY;
  try {
    for (const [name, content] of Object.entries(dotenv)) writeFileSync(path.join(repo, name), content);
    process.chdir(repo);
    process.env.AKAN_NPM_REGISTRY = shellRegistry;
    run();
  } finally {
    process.chdir(cwd);
    if (had === undefined) delete process.env.AKAN_NPM_REGISTRY;
    else process.env.AKAN_NPM_REGISTRY = had;
    rmSync(repo, { recursive: true, force: true });
  }
};

afterEach(() => {
  mock.restore();
});

describe("AKAN_NPM_REGISTRY", () => {
  test("a registry the repo's own dotenv file names is ignored, and the commands say so", () => {
    inRepo({ ".env.local": "AKAN_NPM_REGISTRY=http://127.0.0.1:4999\n" }, () => {
      const warn = spyOn(Logger, "warn").mockImplementation(() => undefined);
      expect(npmRegistryFromEnv()).toBeUndefined();
      expect(getNpmRegistryUrl()).toBe("https://registry.npmjs.org");
      expect(new LocalRegistryRunner().getRegistryUrl()).toBe("http://127.0.0.1:4873");
      warnIgnoredNpmRegistry();
      expect(warn.mock.calls.map(([line]) => line)).toEqual([
        "AKAN_NPM_REGISTRY is set in .env.local, which the repository controls, so it is ignored. Export it in your shell instead.",
      ]);
    });
  });

  test("a registry exported in the shell is used when no dotenv file names it", () => {
    inRepo({ ".env": "OTHER_KEY=placeholder\n" }, () => {
      const warn = spyOn(Logger, "warn").mockImplementation(() => undefined);
      expect(npmRegistryFromEnv()).toBe(shellRegistry);
      expect(getNpmRegistryUrl()).toBe(shellRegistry);
      expect(new LocalRegistryRunner().getRegistryUrl()).toBe(shellRegistry);
      warnIgnoredNpmRegistry();
      expect(warn).not.toHaveBeenCalled();
    });
  });
});

describe("getServedReleasePeers", () => {
  const registryServing = (
    tarballs: string[],
    versions = ["akanjs", "@akanjs/devkit", "@akanjs/cli", "@akanjs/language"],
    listed = versions,
  ) =>
    Bun.serve({
      port: 0,
      fetch: (req) => {
        const { origin } = new URL(req.url);
        const pathname = decodeURIComponent(new URL(req.url).pathname);
        if (pathname.endsWith(".tgz"))
          return new Response(null, {
            status: tarballs.some((name) => pathname.startsWith(`/${name}/-/`)) ? 200 : 404,
          });
        if (versions.some((candidate) => pathname === `/${candidate}`))
          return Response.json({
            versions: listed.includes(pathname.slice(1))
              ? { "3.3.0-rc.8": {}, "3.3.0-rc.9": {} }
              : { "3.3.0-rc.8": {} },
          });
        const name = versions.find((candidate) => pathname === `/${candidate}/3.3.0-rc.9`);
        if (!name) return new Response("{}", { status: 404 });
        return Response.json({
          dist: { tarball: `${origin}/${name}/-/${name.split("/").at(-1)}-3.3.0-rc.9.tgz` },
          peerDependencies: name === "akanjs" ? { react: "19.3.1" } : {},
        });
      },
    });

  test("answers akanjs's peers once the registry serves the version and the tarball of every package", async () => {
    const registry = registryServing(["akanjs", "@akanjs/devkit", "@akanjs/cli", "@akanjs/language"]);
    try {
      expect(await getServedReleasePeers("3.3.0-rc.9", `http://localhost:${registry.port}`)).toEqual({
        react: "19.3.1",
      });
    } finally {
      await registry.stop(true);
    }
  });

  test("names each package whose version or tarball the registry does not serve yet", async () => {
    const registry = registryServing(
      ["akanjs", "@akanjs/devkit", "@akanjs/language"],
      ["akanjs", "@akanjs/devkit", "@akanjs/cli"],
    );
    try {
      await expect(getServedReleasePeers("3.3.0-rc.9", `http://localhost:${registry.port}`)).rejects.toThrow(
        "does not serve @akanjs/cli@3.3.0-rc.9, @akanjs/language@3.3.0-rc.9 yet",
      );
    } finally {
      await registry.stop(true);
    }
  });

  test("waits for @akanjs/code as well in a workspace that lists it", async () => {
    const released = ["akanjs", "@akanjs/devkit", "@akanjs/cli", "@akanjs/language"];
    const registry = registryServing(released, [...released, "@akanjs/code"]);
    const packages = akanReleasePackagesOf({ devDependencies: { "@akanjs/code": "3.3.0-rc.8" } });
    try {
      expect(akanReleasePackagesOf({ devDependencies: { "@akanjs/cli": "3.3.0-rc.8" } })).toEqual(released);
      await expect(getServedReleasePeers("3.3.0-rc.9", `http://localhost:${registry.port}`, packages)).rejects.toThrow(
        "does not serve @akanjs/code@3.3.0-rc.9 yet",
      );
    } finally {
      await registry.stop(true);
    }
  });

  test("names a package whose document does not list the version yet, though the version itself answers", async () => {
    const all = ["akanjs", "@akanjs/devkit", "@akanjs/cli", "@akanjs/language"];
    const registry = registryServing(all, all, ["akanjs", "@akanjs/devkit", "@akanjs/language"]);
    try {
      await expect(getServedReleasePeers("3.3.0-rc.9", `http://localhost:${registry.port}`)).rejects.toThrow(
        "does not serve @akanjs/cli@3.3.0-rc.9 yet",
      );
    } finally {
      await registry.stop(true);
    }
  });
});
