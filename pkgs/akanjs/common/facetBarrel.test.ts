import { describe, expect, test } from "bun:test";
import { facetBarrelNamesOf, facetBarrelOf } from "./facetBarrel";

describe("facetBarrelOf", () => {
  test("exports each camelCase file and folder of a server facet, in Biome's import order", () => {
    expect(facetBarrelOf("srvkit", ["visionProcess.ts", "guards.ts", "index.ts"], ["relay"])).toBe(
      'export * from "./guards";\nexport * from "./relay";\nexport * from "./visionProcess";\n',
    );
  });

  test("keeps a dotted file and an underscore folder out, so code only a spawned process loads is never imported with the barrel", () => {
    expect(
      facetBarrelNamesOf(
        "srvkit",
        ["visionProcess.ts", "vision.worker.ts", "vision.worker.test.ts", "kebab-case.ts", "types.d.ts"],
        ["_vision", ".cache"],
      ),
    ).toEqual(["visionProcess"]);
  });

  test("takes PascalCase names only in ui/, and writes `export {}` for a facet with nothing to export", () => {
    expect(
      facetBarrelNamesOf("ui", ["Card.tsx", "card.recipe.ts", "helper.ts", "styles.css"], ["Recipe", "_Draft"]),
    ).toEqual(["Card", "Recipe"]);
    expect(facetBarrelOf("webkit", ["use-thing.tsx"], [])).toBe("export {};\n");
  });
});
