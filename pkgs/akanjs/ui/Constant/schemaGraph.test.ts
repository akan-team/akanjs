import { describe, expect, test } from "bun:test";

import { SchemaGraphLayout, type SchemaGraphNode } from "./schemaGraph";

const node = (id: string): SchemaGraphNode => ({
  id,
  refName: id,
  title: id,
  subtitle: id,
  kind: "database",
});

describe("SchemaGraphLayout", () => {
  test("places a referenced node in a later column", () => {
    const layout = new SchemaGraphLayout([node("user"), node("file")], [{ from: "user", to: "file", label: "image" }]);
    const user = layout.nodes.find((placed) => placed.id === "user");
    const file = layout.nodes.find((placed) => placed.id === "file");
    expect(user && file && file.x > user.x).toBe(true);
  });

  test("lays a reference cycle out in adjacent columns", () => {
    const cycle = new SchemaGraphLayout(
      [node("a"), node("b")],
      [
        { from: "a", to: "b", label: "b" },
        { from: "b", to: "a", label: "a" },
      ],
    );
    const plain = new SchemaGraphLayout([node("a"), node("b")], [{ from: "a", to: "b", label: "b" }]);
    expect(cycle.edges).toHaveLength(2);
    expect(cycle.width).toBe(plain.width);
  });

  test("drops an edge whose endpoint is not a node", () => {
    const layout = new SchemaGraphLayout([node("user")], [{ from: "user", to: "ghost", label: "ghost" }]);
    expect(layout.edges).toHaveLength(0);
  });

  test("routes a self reference as a loop above the node", () => {
    const layout = new SchemaGraphLayout([node("org")], [{ from: "org", to: "org", label: "parent" }]);
    const org = layout.nodes[0];
    expect(layout.edges[0]?.labelY).toBeLessThan(org?.y ?? 0);
  });

  test("sizes the canvas around every node", () => {
    const layout = new SchemaGraphLayout(
      [node("a"), node("b"), node("c")],
      [
        { from: "a", to: "b", label: "b" },
        { from: "a", to: "c", label: "c" },
      ],
    );
    layout.nodes.forEach((placed) => {
      expect(placed.x + placed.width).toBeLessThanOrEqual(layout.width);
      expect(placed.y + placed.height).toBeLessThanOrEqual(layout.height);
    });
  });

  test("truncates a label that cannot fit its card", () => {
    const long = "A".repeat(120);
    const layout = new SchemaGraphLayout([{ ...node("long"), title: long }], []);
    expect(layout.nodes[0]?.titleText.endsWith("…")).toBe(true);
  });
});
