import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DepsSerializer } from "./depsSerializer";
import { DevtoolsFixture, fixtureRefName } from "./devtools.fixture";
import type { DepsData } from "./types";

let fixture: DevtoolsFixture;
let data: DepsData;

beforeAll(async () => {
  fixture = await DevtoolsFixture.boot("all");
  data = new DepsSerializer({
    di: fixture.lifecycle,
    env: fixture.env,
    name: "AkanServer",
    status: "running",
    serverMode: fixture.serverMode,
    prefix: "/api",
    websocketPrefix: "/ws",
    openapi: false,
  }).build();
});

afterAll(async () => {
  await fixture.destroy();
});

const nodeById = (id: string) => data.nodes.find((node) => node.id === id);

describe("DepsSerializer", () => {
  test("emits a kind-prefixed node per registered service, adaptor, and signal", () => {
    expect(nodeById(`service:${fixtureRefName}`)).toMatchObject({ kind: "service", serviceType: "database" });
    expect(nodeById(`adaptor:${fixtureRefName}Model`)).toMatchObject({ kind: "adaptor" });
    expect(nodeById(`serverSignal:${fixtureRefName}Signal`)).toBeDefined();
    expect(nodeById(`internal:${fixtureRefName}Internal`)).toBeDefined();
    expect(nodeById(`endpoint:${fixtureRefName}Endpoint`)).toBeDefined();
    expect(nodeById("env:env")).toBeDefined();
  });

  test("ranks nodes by the topological init stage the container resolved", () => {
    const service = nodeById(`service:${fixtureRefName}`);
    expect(typeof service?.stage).toBe("number");
    expect(data.stages.service.flat()).toContain(fixtureRefName);
    expect(data.stages.adaptor.flat()).toContain(`${fixtureRefName}Model`);
  });

  test("draws the database inject as an edge to the generated model adaptor", () => {
    const edge = data.edges.find(
      (candidate) => candidate.from === `service:${fixtureRefName}` && candidate.kind === "database",
    );
    expect(edge?.to).toBe(`adaptor:${fixtureRefName}Model`);
  });

  test("draws service injects to the refName the Service suffix implies", () => {
    const edge = data.edges.find(
      (candidate) => candidate.kind === "service" && candidate.prop === `${fixtureRefName}Service`,
    );
    expect(edge?.to).toBe(`service:${fixtureRefName}`);
  });

  test("resolves a plug on a role to the concrete adaptor behind it", () => {
    const plug = data.edges.find((candidate) => candidate.kind === "plug" && candidate.resolvedTo);
    expect(plug).toBeDefined();
    expect(plug?.to.startsWith("adaptor:")).toBe(true);
    expect(data.roles.length).toBeGreaterThan(0);
    expect(data.roles.every((role) => Boolean(role.role) && Boolean(role.impl))).toBe(true);
  });

  test("exposes env key names without any non-public value", () => {
    process.env.DEVTOOLS_TEST_SECRET = "super-secret";
    const withSecret = new DepsSerializer({
      di: fixture.lifecycle,
      env: fixture.env,
      name: "AkanServer",
      status: "running",
      serverMode: "all",
      prefix: "/api",
      websocketPrefix: "/ws",
      openapi: false,
    }).build();
    process.env.DEVTOOLS_TEST_SECRET = undefined;

    expect(withSecret.env.keys).toContain("DEVTOOLS_TEST_SECRET");
    expect(withSecret.env.public.DEVTOOLS_TEST_SECRET).toBeUndefined();
    expect(JSON.stringify(withSecret.env)).not.toContain("super-secret");
    expect(withSecret.env.public.AKAN_PUBLIC_APP_NAME).toBe("devtools");
  });

  test("reports uses by key and class name only", () => {
    const uses = data.nodes.filter((node) => node.kind === "use");
    expect(uses.every((node) => Object.keys(node).every((key) => key !== "value" && key !== "instance"))).toBe(true);
  });

  test("round-trips through JSON", () => {
    expect(() => JSON.stringify(data)).not.toThrow();
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});
