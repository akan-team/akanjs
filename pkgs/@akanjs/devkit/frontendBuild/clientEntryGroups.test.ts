import { describe, expect, test } from "bun:test";
import path from "node:path";
import { StoreBootstrap } from "../artifact/storeBootstrap";
import type { AskedExports } from "./clientBuildTypes";
import { ClientEntryGroups } from "./clientEntryGroups";

describe("ClientEntryGroups", () => {
  const entry = (name: string) => path.resolve(`/repo/apps/demo/ui/${name}.tsx`);
  const part = (name: string, ...names: string[]) => ({ entry: entry(name), names });
  const entriesOf = (groups: readonly { entry: string }[][]) =>
    groups.map((group) => group.map((held) => path.basename(held.entry, ".tsx")));

  test("puts together the entries exactly the same routes load, whatever order the routes come in", () => {
    const routes: Record<string, string[]> = {
      Shell: ["/a", "/b"],
      Nav: ["/b", "/a"],
      Board: ["/b"],
      Chart: ["/b"],
      Solo: ["/a"],
    };

    const groups = ClientEntryGroups.plan(
      Object.keys(routes).map((name) => part(name, name)),
      (held) => routes[path.basename(held.entry, ".tsx")] ?? [],
    );

    expect(entriesOf(groups)).toEqual([["Shell", "Nav"], ["Board", "Chart"], ["Solo"]]);
  });

  test("leaves alone an entry no route loads and an entry whose export names are not known", () => {
    const groups = ClientEntryGroups.plan(
      [part("Unused", "Unused"), part("Other", "Other"), part("Star"), part("Bare")],
      (held) => (held.entry === entry("Unused") || held.entry === entry("Other") ? [] : ["/a"]),
    );

    expect(entriesOf(groups)).toEqual([["Unused"], ["Other"], ["Star"], ["Bare"]]);
  });

  test("a part of an entry is loaded by the routes asking it for one of its names, and by a route asking for none in particular", () => {
    const loadedBy = ClientEntryGroups.loadedBy(
      new Map([
        ["/a", [entry("Pair"), entry("Pair")]],
        ["/b", [entry("Pair")]],
        ["/c", [entry("Pair")]],
        ["/d", [entry("Else")]],
      ]),
      new Map<string, AskedExports>([
        ["/a", new Map([[entry("Pair"), ["A"]]])],
        ["/b", new Map([[entry("Pair"), ["B"]]])],
        ["/c", new Map([[entry("Pair"), null]])],
      ]),
    );

    expect(loadedBy(part("Pair", "A"))).toEqual(["/a", "/c"]);
    expect(loadedBy(part("Pair", "B"))).toEqual(["/b", "/c"]);
    expect(loadedBy(part("Else", "Else"))).toEqual(["/d"]);
    expect(loadedBy(part("Never", "Never"))).toEqual([]);
  });

  test("a group exports every name under a name of its own, so two entries' defaults do not collide", () => {
    const exports = ClientEntryGroups.exportsOf([part("One", "default", "One"), part("Two", "default")]);

    expect([...exports]).toEqual([
      ["g0", { entry: entry("One"), name: "default" }],
      ["g1", { entry: entry("One"), name: "One" }],
      ["g2", { entry: entry("Two"), name: "default" }],
    ]);
    expect(ClientEntryGroups.source("demo", exports, "page")).toBe(
      [
        ...StoreBootstrap.importLines("demo", "page"),
        `export { default as g0, One as g1 } from ${JSON.stringify(entry("One"))};`,
        `export { default as g2 } from ${JSON.stringify(entry("Two"))};`,
        "",
      ].join("\n"),
    );
  });
});
