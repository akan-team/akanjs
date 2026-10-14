import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { transitionTypes, viewTransitionClassOf } from "./transitionTypes";

describe("viewTransitionClassOf", () => {
  test("ui/styles.css animates every transition both ways under the class viewTransitionClassOf names", () => {
    const css = readFileSync(new URL("../ui/styles.css", import.meta.url), "utf8");
    const animated = transitionTypes.flatMap((transition) =>
      transition === "none"
        ? []
        : [viewTransitionClassOf(transition, "push"), viewTransitionClassOf(transition, "pop")],
    );

    expect(animated).toHaveLength(8);
    for (const name of animated) expect(css).toContain(`::view-transition-new(.${name})`);
    for (const name of animated) expect(css).toContain(`::view-transition-old(.${name})`);
  });
});
