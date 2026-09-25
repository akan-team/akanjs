import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { sharedContext } from "./sharedContext";

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [path] : [];
  });

describe("sharedContext", () => {
  test("a second evaluation of the same module gets the object the first one made", () => {
    // What two bundled copies of a module do: each runs it, and only one context may survive that.
    expect(sharedContext("interningTest", 0)).toBe(sharedContext("interningTest", 0));
    expect(sharedContext("interningTest", 0)).not.toBe(sharedContext("otherTest", 0));
  });

  test("a module reaching for a client-only react API declares itself a client module", () => {
    // What the react-server condition resolves `react` to has no `createContext`, no `useState`, no hooks at all.
    // A module without the directive is evaluated in that graph the moment a server component imports anything
    // from its barrel, and the app dies at boot with "Export named 'createContext' not found" — which no
    // typecheck and no build reports, because both resolve `react` the ordinary way.
    const root = `${import.meta.dir}/..`;
    const clientOnly =
      /^(createContext|useState|useEffect|useLayoutEffect|useContext|useRef|useReducer|useSyncExternalStore|useImperativeHandle)$/;
    const undeclared = [...sources(`${root}/client`), ...sources(`${root}/ui`)]
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        const named = source.match(/import\s*\{([^}]*)\}\s*from\s*"react"/)?.[1];
        if (!named) return false;
        const bindings = named.split(",").map((one) => one.trim());
        // A `type` import is erased before the module ever loads, so it never reaches the server graph.
        const reaches = bindings.filter((one) => !one.startsWith("type ")).some((one) => clientOnly.test(one));
        return reaches && !/^\s*"use client"/.test(source);
      })
      .map((path) => path.slice(root.length + 1));
    expect(undeclared).toEqual([]);
  });

  test("nothing in the client or ui facet makes a context the plain way", () => {
    // A plain `createContext` works in the monorepo, where there is one copy of every module, and breaks only
    // once an app bundles it into more than one chunk — so using the feature cannot catch it. This can.
    const root = `${import.meta.dir}/..`;
    const offenders = [...sources(`${root}/client`), ...sources(`${root}/ui`)]
      .filter((path) => !path.endsWith("/client/sharedContext.ts"))
      .filter((path) => /createContext[<(]/.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(root.length + 1));
    expect(offenders).toEqual([]);
  });
});
