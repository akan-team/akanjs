import { describe, expect, test } from "bun:test";
import {
  CLIENT_VALUE,
  Int,
  type PrimitiveAgentFace,
  PrimitiveRegistry,
  PrimitiveScalar,
  SERVER_VALUE,
} from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import type { SerializedSignal } from "../types";
import { McpDocument } from "./McpDocument";

class McpTagInput extends via((field) => ({ label: field(String) })) {}
class McpTagObject extends via(McpTagInput, (field) => ({ weight: field(Int, { default: 0 }) })) {}
class LightMcpTag extends via(McpTagObject, ["label"] as const, () => ({})) {}
class McpTag extends via(McpTagObject, LightMcpTag, () => ({})) {}
class McpTagInsight extends via(McpTag, () => ({})) {}
ConstantRegistry.buildModel("mcpTag", McpTagInput, McpTagObject, McpTag, LightMcpTag, McpTagInsight, {});

class McpPostInput extends via((field) => ({
  title: field(String),
  tag: field(McpTag).optional(),
  draftKey: field.secret(String).optional(),
})) {}
class McpPostObject extends via(McpPostInput, (field) => ({ views: field(Int, { default: 0 }) })) {}
class LightMcpPost extends via(McpPostObject, ["title"] as const, () => ({})) {}
class McpPost extends via(McpPostObject, LightMcpPost, () => ({})) {}
class McpPostInsight extends via(McpPost, (field) => ({ total: field(Int, { default: 0 }) })) {}
ConstantRegistry.buildModel("mcpPost", McpPostInput, McpPostObject, McpPost, LightMcpPost, McpPostInsight, {});

const signal = (): Record<string, SerializedSignal> => ({
  mcpPost: {
    prefix: "mcpPost",
    getGuards: ["Public"],
    cruGuards: ["Admin"],
    slice: {
      // The root slice `slice()` generates: a filter key plus that filter's args in an `Any`.
      "": {
        args: [
          { type: "search", name: "queryKey", refName: "String", nullable: true, oneOf: ["any", "byAuthor"] },
          { type: "search", name: "args", refName: "Any", nullable: true },
        ],
        guards: ["Public"],
      },
      byAuthor: {
        args: [{ type: "search", name: "authorId", refName: "ID", nullable: true }],
        guards: ["Public"],
      },
      // `init().param("from", Date).search("periodTypes", …)`: a slice's params are required and are not `search`.
      inPeriod: {
        args: [
          { type: "param", name: "from", refName: "Date" },
          { type: "search", name: "periodTypes", refName: "String", arrDepth: 1, nullable: true },
        ],
        guards: ["Public"],
      },
      internalOnly: { args: [], guards: ["Admin"] },
      // `init({ mcp: false })`: one declaration covers both entries the slice generates.
      quietSlice: { args: [], guards: ["Public"], mcp: false },
      // `init({ guards: [Public, Person] })`: the serializer stamped `agents: false` because `Person` admits none.
      personSlice: { args: [], guards: ["Public", "Person"], agents: false },
    },
    endpoint: {
      countMcpPosts: { type: "query", args: [], returns: { refName: "Int" }, guards: ["Public"] },
      requestMcpPostCode: {
        type: "mutation",
        args: [],
        returns: { refName: "Boolean" },
        guards: ["Admin"],
        mcp: false,
      },
      findMcpPost: {
        type: "query",
        args: [],
        returns: { refName: "mcpPost", modelType: "full", nullable: true },
        guards: ["Public"],
      },
      searchMcpPosts: {
        type: "query",
        args: [],
        returns: { refName: "mcpPost", modelType: "light", arrDepth: 1, nullable: true },
        guards: ["Public"],
      },
      undeclaredMcpPost: { type: "query", args: [], returns: { refName: "String" } },
      signMcpPost: {
        type: "mutation",
        args: [],
        returns: { refName: "Boolean" },
        guards: ["Admin", "Person"],
        agents: false,
      },
      summaryMcpPost: {
        type: "query",
        args: [{ type: "search", name: "status", refName: "String", nullable: true }],
        returns: { refName: "String" },
        guards: ["Public"],
      },
      rawMcpPost: { type: "query", args: [], returns: { refName: "Any" }, guards: ["Public"] },
      publishMcpPost: {
        type: "mutation",
        args: [],
        returns: { refName: "Boolean" },
        guards: ["Admin"],
      },
      draftMcpPost: {
        type: "mutation",
        args: [{ type: "body", name: "data", refName: "mcpPost", modelType: "input" }],
        returns: { refName: "mcpPost", modelType: "full" },
        guards: ["Admin"],
      },
      unguardedMcpPost: { type: "mutation", args: [], returns: { refName: "Boolean" } },
      wipeMcpPosts: { type: "mutation", args: [], returns: { refName: "Boolean" }, guards: ["Public"] },
      importMcpPost: {
        type: "mutation",
        args: [{ type: "body", name: "payload", refName: "Any" }],
        returns: { refName: "Boolean" },
        guards: ["Admin"],
      },
    },
  },
});

const names = (doc: McpDocument) => doc.tools.map((tool) => tool.name);

describe("McpDocument", () => {
  test("publishes every candidate its guards admit, with nothing to opt in", () => {
    expect(names(new McpDocument(signal()))).toEqual([
      "countMcpPosts",
      "createMcpPost",
      "draftMcpPost",
      "findMcpPost",
      "mcpPost",
      "mcpPostInsight",
      "mcpPostInsightByAuthor",
      "mcpPostInsightInPeriod",
      "mcpPostInsightInternalOnly",
      "mcpPostList",
      "mcpPostListByAuthor",
      "mcpPostListInPeriod",
      "mcpPostListInternalOnly",
      "publishMcpPost",
      "removeMcpPost",
      "searchMcpPosts",
      "summaryMcpPost",
      "updateMcpPost",
    ]);
  });

  test("publishes one read per model rather than the same document in two shapes", () => {
    const doc = new McpDocument(signal());
    expect(names(doc)).not.toContain("lightMcpPost");
    expect(names(doc)).toContain("mcpPost");
    expect(doc.refusals.find(({ key }) => key === "lightMcpPost")?.reason).toContain("`mcpPost`");
    expect(doc.resolveResource("akan://mcpPost/light/6712ab34cd56ef7890123456")).toBeNull();
    expect(doc.resourceTemplates.map((template) => template.uriTemplate)).not.toContain(
      "akan://mcpPost/light/{mcpPostId}",
    );
  });

  test("keeps out what an author declared `mcp: false` on, at every altitude that declares it", () => {
    const doc = new McpDocument(signal());
    const refusals = Object.fromEntries(doc.refusals.map(({ key, reason }) => [key, reason]));
    expect(names(doc)).not.toContain("requestMcpPostCode");
    expect(refusals.requestMcpPostCode).toContain("HTTP still serves it");
    expect(names(doc)).not.toContain("mcpPostListQuietSlice");
    expect(names(doc)).not.toContain("mcpPostInsightQuietSlice");
    expect(names(doc)).toContain("mcpPostList");
    expect(names(doc)).toContain("countMcpPosts");
  });

  test("with MCP Apps, publishes an `mcp: false` endpoint to rendered views only, and nothing else it refused", () => {
    const doc = new McpDocument(signal(), { apps: true });
    const appNames = doc.appTools.map((tool) => tool.name);
    expect(appNames).toEqual(
      expect.arrayContaining(["requestMcpPostCode", "mcpPostListQuietSlice", "mcpPostInsightQuietSlice"]),
    );
    expect(names(doc)).not.toContain("requestMcpPostCode");
    expect(doc.appTools.every((tool) => tool._meta?.ui?.visibility?.join() === "app")).toBe(true);
    expect(doc.findTool("requestMcpPostCode")?.key).toBe("requestMcpPostCode");
    expect(doc.isAppOnly("requestMcpPostCode")).toBe(true);
    const undescribed = doc.undescribed.map(({ key }) => key);
    expect(undescribed.length).toBeGreaterThan(0);
    for (const name of appNames) expect(undescribed).not.toContain(name);
    expect(doc.refusals.map(({ key }) => key)).not.toContain("requestMcpPostCode");
    expect(appNames).not.toContain("signMcpPost");
    expect(appNames).not.toContain("mcpPostListPersonSlice");
    expect(new McpDocument(signal()).appTools).toEqual([]);
  });

  test("with MCP Apps, lets a view read a relation's light shape under the get's guards, and no model", () => {
    const doc = new McpDocument(signal(), { apps: true });
    expect(names(doc)).not.toContain("lightMcpPost");
    expect(doc.appTools.map((tool) => tool.name)).toContain("lightMcpPost");
    expect(doc.findTool("lightMcpPost")?.endpoint.guards).toEqual(doc.findTool("mcpPost")?.endpoint.guards);
    expect(doc.appOnly.find(({ key }) => key === "lightMcpPost")?.reason).toContain("`mcpPost`");
    expect(doc.appOnly.find(({ key }) => key === "requestMcpPostCode")?.reason).toContain("`mcp: false`");
    expect(doc.resourceTemplates.map(({ name }) => name)).not.toContain("lightMcpPost");
    const personOnly = signal();
    personOnly.mcpPost.agents = { get: false };
    expect(new McpDocument(personOnly, { apps: true }).appTools.map((tool) => tool.name)).not.toContain("lightMcpPost");
  });

  test("keeps out what a person-only guard protects, at every altitude, and says which guards did it", () => {
    const doc = new McpDocument(signal());
    const refusals = Object.fromEntries(doc.refusals.map(({ key, reason }) => [key, reason]));
    expect(names(doc)).not.toContain("signMcpPost");
    expect(refusals.signMcpPost).toContain("Admin, Person");
    expect(refusals.signMcpPost).toContain("HTTP still serves it");
    expect(names(doc)).not.toContain("mcpPostListPersonSlice");
    expect(names(doc)).not.toContain("mcpPostInsightPersonSlice");
    const withMap = signal();
    withMap.mcpPost.agents = { remove: false };
    const mapped = new McpDocument(withMap);
    expect(names(mapped)).not.toContain("removeMcpPost");
    expect(names(mapped)).toContain("createMcpPost");
    expect(names(mapped)).toContain("mcpPost");
  });

  test("takes the generated verbs the module map names off the shelf, and leaves the rest", () => {
    const withMap = signal();
    const post = withMap.mcpPost;
    if (!post) throw new Error("fixture");
    post.mcp = { create: false, update: false, remove: false };
    const exposed = names(new McpDocument(withMap));
    expect(exposed).not.toContain("createMcpPost");
    expect(exposed).not.toContain("updateMcpPost");
    expect(exposed).not.toContain("removeMcpPost");
    expect(exposed).toContain("mcpPost");
    expect(exposed).toContain("mcpPostList");
    expect(exposed).toContain("draftMcpPost");
  });

  test("says what the listing costs, and which signals it went to", () => {
    const doc = new McpDocument(signal());
    const cost = doc.listingCost;
    const entries = [...doc.tools];
    expect(cost.bytes).toBe(entries.reduce((sum, entry) => sum + JSON.stringify(entry).length, 0));
    expect(cost.bySignal.map(({ refName }) => refName)).toEqual(["mcpPost"]);
    expect(cost.bySignal[0]?.entries).toBe(entries.length);
    expect(doc.listingCost).toBe(cost);
  });

  test("readOnly drops every mutation whatever its guards allow", () => {
    const exposed = names(new McpDocument(signal(), { readOnly: true }));
    expect(exposed).not.toContain("publishMcpPost");
    expect(exposed).toContain("mcpPostList");
  });

  test("refuses shapes MCP cannot carry, and everything the guards do not admit", () => {
    const exposed = names(new McpDocument(signal()));
    expect(exposed).not.toContain("rawMcpPost");
    expect(exposed).not.toContain("importMcpPost");
    expect(exposed).not.toContain("undeclaredMcpPost");
    expect(exposed).not.toContain("unguardedMcpPost");
    expect(exposed).not.toContain("wipeMcpPosts");
    expect(exposed).toContain("publishMcpPost");
  });

  test("says why every candidate it kept out was kept out, instead of dropping it silently", () => {
    const refusals = Object.fromEntries(new McpDocument(signal()).refusals.map(({ key, reason }) => [key, reason]));
    expect(Object.keys(refusals).sort()).toEqual([
      "importMcpPost",
      "lightMcpPost",
      "mcpPostInsightPersonSlice",
      "mcpPostInsightQuietSlice",
      "mcpPostListPersonSlice",
      "mcpPostListQuietSlice",
      "rawMcpPost",
      "requestMcpPostCode",
      "signMcpPost",
      "undeclaredMcpPost",
      "unguardedMcpPost",
      "wipeMcpPosts",
    ]);
    expect(refusals.rawMcpPost).toContain("`Any`");
    expect(refusals.undeclaredMcpPost).toContain("declares no guards");
    expect(refusals.wipeMcpPosts).toContain("`[Public]` is having none");
    expect(refusals.importMcpPost).toContain("`payload`");
  });

  test("keeps hidden and secret field names out of the output schema and in the input schema", () => {
    const doc = new McpDocument(signal());
    const draft = doc.tools.find((tool) => tool.name === "draftMcpPost");
    const input = draft?.inputSchema.$defs as Record<string, { properties: object }>;
    const output = draft?.outputSchema?.$defs as Record<string, { properties: object }>;
    expect(Object.keys(input.McpPostInput.properties)).toContain("draftKey");
    expect(Object.keys(output.McpPost.properties)).not.toContain("draftKey");
    expect(Object.keys(output.McpPost.properties)).toContain("title");
  });

  test("reports the read-only valve as a refusal like any other", () => {
    const refusal = new McpDocument(signal(), { readOnly: true }).refusals.find(({ key }) => key === "publishMcpPost");
    expect(refusal?.reason).toContain("read-only");
  });

  test("leaves an Any argument out of the schema instead of publishing an empty one", () => {
    const doc = new McpDocument(signal());
    const list = doc.tools.find((tool) => tool.name === "mcpPostList");
    const properties = (list?.inputSchema.properties ?? {}) as Record<string, unknown>;
    expect(Object.keys(properties)).toEqual(["queryKey", "skip", "limit", "sort"]);
    expect(properties.queryKey).toEqual({ type: ["string", "null"], enum: ["any", "byAuthor", null] });
    expect(doc.resourceTemplates.map((template) => template.uriTemplate)).toContain(
      "akan://mcpPost/list{?queryKey,skip,limit,sort}",
    );
  });

  test("carries dictionary text into title, description and argument descriptions", () => {
    const text: Record<string, string> = {
      "mcpPost.signal.mcpPostListByAuthor": "Posts By Author",
      "mcpPost.signal.mcpPostListByAuthor.desc": "Lists the posts an author wrote",
      "mcpPost.signal.mcpPostListByAuthor.arg.authorId.desc": "Author to filter by",
    };
    const doc = new McpDocument(signal(), { resolveDescription: (key) => text[key] });
    const tool = doc.tools.find((candidate) => candidate.name === "mcpPostListByAuthor");
    if (!tool) throw new Error("mcpPostListByAuthor is not in the catalogue");
    expect(tool.title).toBe("Posts By Author");
    expect(tool.description).toBe("Lists the posts an author wrote");
    expect((tool.inputSchema.properties as Record<string, { description?: string }>).authorId.description).toBe(
      "Author to filter by",
    );
  });

  test("titles the model's own list and insight from the model rather than from the framework's placeholder", () => {
    const text: Record<string, string> = {
      "mcpPost.modelName": "Post",
      "mcpPost.modelDesc": "An article somebody wrote",
      "mcpPost.signal.mcpPostList": "Slice List - Universal",
      "mcpPost.signal.mcpPostList.desc": "Slice List - Universal Slice",
      "mcpPost.signal.mcpPostInsight": "Slice Insight - Universal",
    };
    const doc = new McpDocument(signal(), { resolveDescription: (key) => text[key] });
    expect(doc.tools.find((tool) => tool.name === "mcpPostList")).toMatchObject({
      title: "Post",
      description: "An article somebody wrote",
    });
    expect(doc.tools.find((tool) => tool.name === "mcpPostInsight")?.title).toBe("Post");
    expect(doc.tools.find((tool) => tool.name === "mcpPostListByAuthor")?.title).toBeUndefined();
    expect(doc.resourceTemplates.find((template) => template.name === "mcpPostList")?.title).toBe("Post");
  });

  test("adds what the model is to the generated CRUD text, which only says the verb", () => {
    const text: Record<string, string> = {
      "mcpPost.modelDesc": "An article somebody wrote",
      "mcpPost.signal.mcpPost": "Get Post",
      "mcpPost.signal.mcpPost.desc": "Get Post",
    };
    const doc = new McpDocument(signal(), { resolveDescription: (key) => text[key] });
    expect(doc.tools.find((tool) => tool.name === "mcpPost")).toMatchObject({
      title: "Get Post",
      description: "Get Post — An article somebody wrote",
    });
    expect(doc.tools.find((tool) => tool.name === "removeMcpPost")?.description).toContain("An article somebody wrote");
    expect(doc.tools.find((tool) => tool.name === "countMcpPosts")?.description).toBeUndefined();
  });

  test("spells the errors an endpoint declares into its description, after the dictionary text", () => {
    const declared = signal();
    const countMcpPosts = declared.mcpPost?.endpoint.countMcpPosts;
    if (!countMcpPosts) throw new Error("countMcpPosts is not in the fixture");
    declared.mcpPost.endpoint.countMcpPosts = {
      ...countMcpPosts,
      errors: { 403: ["mcpPost.error.hidden"], 409: ["mcpPost.error.locked"] },
    };
    const text: Record<string, string> = {
      "mcpPost.signal.countMcpPosts.desc": "Counts the posts",
      "mcpPost.error.locked": "The board is locked.",
    };
    const doc = new McpDocument(declared, { resolveDescription: (key) => text[key] });
    expect(doc.tools.find((tool) => tool.name === "countMcpPosts")?.description).toBe(
      "Counts the posts\nErrors it answers with on purpose: 403 mcpPost.error.hidden, 409 mcpPost.error.locked (The board is locked.).",
    );
  });

  test("marks path args required and leaves every search arg optional", () => {
    const doc = new McpDocument(signal());
    const single = doc.tools.find((tool) => tool.name === "mcpPost");
    expect(single?.inputSchema.required).toEqual(["mcpPostId"]);
    const list = doc.tools.find((tool) => tool.name === "mcpPostListByAuthor");
    expect(Object.keys(list?.inputSchema.properties as object)).toEqual(["authorId", "skip", "limit", "sort"]);
    expect(list?.inputSchema.required).toBeUndefined();
    expect(doc.tools.find((tool) => tool.name === "mcpPostListInPeriod")?.inputSchema.required).toEqual(["from"]);
  });

  test("closes each tool's schema over the models it mentions", () => {
    const doc = new McpDocument(signal());
    const tool = doc.tools.find((candidate) => candidate.name === "mcpPost");
    const defs = tool?.outputSchema?.$defs as Record<string, { properties: Record<string, unknown> }>;
    expect(Object.keys(defs)).toEqual(["McpPost"]);
    expect(defs.McpPost.properties.tag).toEqual({ type: ["object", "null"], description: "McpTag" });
    expect(tool?.outputSchema?.$ref).toBeUndefined();
    expect(tool?.outputSchema?.properties).toEqual(defs.McpPost.properties);
    const full = new McpDocument(signal(), { outputSchema: "full" }).tools.find(
      (candidate) => candidate.name === "mcpPost",
    );
    expect(Object.keys(full?.outputSchema?.$defs as object)).toEqual(["McpPost", "McpTag"]);
  });

  test("roots every input and output schema at an object, as SDK clients validate", () => {
    for (const outputSchema of ["shallow", "full"] as const) {
      for (const tool of new McpDocument(signal(), { outputSchema }).tools) {
        expect(tool.inputSchema.type).toBe("object");
        if (tool.outputSchema) expect(tool.outputSchema.type).toBe("object");
      }
    }
  });

  test("asks for a relation's id in a request schema, which is what the wire carries", () => {
    const doc = new McpDocument(signal());
    const draft = doc.tools.find((tool) => tool.name === "draftMcpPost");
    const input = draft?.inputSchema.$defs as Record<string, { properties: Record<string, unknown> }>;
    expect(Object.keys(input)).toEqual(["McpPostInput"]);
    expect(input.McpPostInput.properties.tag).toEqual({ type: ["string", "null"] });
  });

  test("publishes no outputSchema at all when asked, and keeps every input schema", () => {
    const doc = new McpDocument(signal(), { outputSchema: "none" });
    expect(doc.tools.every((tool) => tool.outputSchema === undefined)).toBe(true);
    expect(doc.tools.find((tool) => tool.name === "draftMcpPost")?.inputSchema.$defs).toBeDefined();
  });

  test("wraps an array result so structuredContent stays an object", () => {
    const doc = new McpDocument(signal());
    const list = doc.tools.find((tool) => tool.name === "mcpPostList");
    expect(list?.outputSchema).toMatchObject({
      type: "object",
      required: ["items"],
      properties: { items: { type: "array", items: { $ref: "#/$defs/LightMcpPost" } } },
    });
    const endpoint = { type: "query", args: [], returns: { refName: "mcpPost", modelType: "light", arrDepth: 1 } };
    expect(McpDocument.structuredContent(endpoint as never, [{ id: "1" }])).toEqual({ items: [{ id: "1" }] });
  });

  test("omits outputSchema for a scalar return so no structured result is promised", () => {
    const doc = new McpDocument(signal());
    const count = doc.tools.find((tool) => tool.name === "countMcpPosts");
    expect(count?.outputSchema).toBeUndefined();
    expect(McpDocument.structuredContent({ returns: { refName: "Int" } } as never, 3)).toBeUndefined();
  });

  test("promises no schema for a return whose empty answer is null", () => {
    const doc = new McpDocument(signal());
    const endpoint = { returns: { refName: "mcpPost", modelType: "full", nullable: true } };
    expect(doc.tools.find((tool) => tool.name === "findMcpPost")?.outputSchema).toBeUndefined();
    expect(McpDocument.structuredContent(endpoint as never, null)).toBeUndefined();
    expect(McpDocument.structuredContent(endpoint as never, { id: "1" })).toEqual({ id: "1" });
    const list = doc.tools.find((tool) => tool.name === "searchMcpPosts");
    expect(list?.outputSchema).toMatchObject({ type: "object", required: ["items"] });
  });

  test("derives read-only annotations for a query", () => {
    const doc = new McpDocument(signal());
    expect(doc.tools.find((tool) => tool.name === "mcpPost")?.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  test("addresses the single and list reads but not an aggregate", () => {
    const doc = new McpDocument(signal());
    expect(doc.resourceTemplates.map((template) => template.uriTemplate)).toEqual([
      "akan://mcpPost/{mcpPostId}",
      "akan://mcpPost/list{?queryKey,skip,limit,sort}",
      "akan://mcpPost/list/byAuthor{?authorId,skip,limit,sort}",
      "akan://mcpPost/list/inPeriod{?from,periodTypes,skip,limit,sort}",
      "akan://mcpPost/list/internalOnly{?skip,limit,sort}",
    ]);
    expect(doc.resourceTemplates.some((template) => template.name.includes("Insight"))).toBe(false);
    expect(doc.resources).toEqual([]);
  });

  test("gives a custom endpoint a tool but never an address", () => {
    const doc = new McpDocument(signal());
    expect(names(doc)).toContain("summaryMcpPost");
    expect(doc.resourceTemplates.map((template) => template.name)).not.toContain("summaryMcpPost");
    expect(doc.resourceTemplates.filter((t) => t.uriTemplate === "akan://mcpPost/{mcpPostId}")).toHaveLength(1);
    expect(doc.resolveResource("akan://mcpPost/6712ab34cd56ef7890123456")?.exposed.key).toBe("mcpPost");
  });

  test("names what it published with no description of its own", () => {
    const text: Record<string, string> = {
      "mcpPost.signal.countMcpPosts.desc": "Counts every post",
      "mcpPost.signal.mcpPost": "Get Post",
      "mcpPost.signal.mcpPost.desc": "Get Post",
    };
    const undescribed = Object.fromEntries(
      new McpDocument(signal(), { resolveDescription: (key) => text[key] }).undescribed.map(({ key, reason }) => [
        key,
        reason,
      ]),
    );
    expect(undescribed.countMcpPosts).toBeUndefined();
    expect(undescribed.mcpPost).toContain("`mcpPost` has no `.desc()`");
    expect(undescribed.mcpPostList).toContain("`mcpPost` has no `.desc()`");
    expect(undescribed.findMcpPost).toContain("no dictionary `.desc()`");
    expect(undescribed.unguardedMcpPost).toBeUndefined();
    const described = new McpDocument(signal(), {
      resolveDescription: (key) => ({ ...text, "mcpPost.modelDesc": "An article somebody wrote" })[key],
    });
    expect(described.undescribed.map(({ key }) => key)).not.toContain("mcpPost");
    expect(described.undescribed.map(({ key }) => key)).not.toContain("mcpPostList");
  });

  test("resolves a uri only when its endpoint was advertised", () => {
    const doc = new McpDocument(signal());
    expect(doc.resolveResource("akan://mcpPost/6712ab34cd56ef7890123456")?.exposed.key).toBe("mcpPost");
    expect(doc.resolveResource("akan://mcpTag/6712ab34cd56ef7890123456")).toBeNull();
    expect(doc.resolveResource("akan://mcpPost/list/undeclared")).toBeNull();
  });

  test("expands a tool's template into the uri its call answers to, and nothing for a tool without one", () => {
    const doc = new McpDocument(signal());
    expect(doc.resourceUri("mcpPost", { mcpPostId: "6712ab34cd56ef7890123456" })).toBe(
      "akan://mcpPost/6712ab34cd56ef7890123456",
    );
    expect(doc.resourceUri("mcpPostListInPeriod", { from: "2026-01-01", periodTypes: ["day", "week"], limit: 5 })).toBe(
      "akan://mcpPost/list/inPeriod?from=2026-01-01&periodTypes=day&periodTypes=week&limit=5",
    );
    expect(doc.resourceUri("summaryMcpPost", {})).toBeUndefined();
  });

  test("orders the catalogue deterministically", () => {
    // Clients cache the list and an LLM prompt cache keys on its exact text.
    expect(names(new McpDocument(signal()))).toEqual(names(new McpDocument(signal())));
  });
});

interface McpNoteDoc {
  lines: string[];
}
class McpNote extends PrimitiveScalar {
  static override refName = "McpNote";
  static override [SERVER_VALUE]: McpNoteDoc;
  static override [CLIENT_VALUE]: McpNoteDoc;
  static override jsonSchema = { type: "object", properties: { lines: { type: "array" } } };
  static override agent: PrimitiveAgentFace<McpNoteDoc> = {
    schema: { type: "string", description: "Markdown." },
    read: (value) => value.lines.join("\n"),
  };
}
PrimitiveRegistry.register(McpNote);

class McpPageInput extends via((field) => ({ title: field(String), body: field(McpNote) })) {}
class McpPageObject extends via(McpPageInput, () => ({})) {}
class LightMcpPage extends via(McpPageObject, ["title"] as const, () => ({})) {}
class McpPage extends via(McpPageObject, LightMcpPage, () => ({})) {}
class McpPageInsight extends via(McpPage, () => ({})) {}
ConstantRegistry.buildModel("mcpPage", McpPageInput, McpPageObject, McpPage, LightMcpPage, McpPageInsight, {});

describe("McpDocument with an agent-faced primitive", () => {
  const doc = new McpDocument({
    mcpPage: {
      prefix: "mcpPage",
      endpoint: {
        rewriteMcpPage: {
          type: "mutation",
          args: [
            { type: "param", name: "mcpPageId", refName: "ID" },
            { type: "body", name: "body", refName: "McpNote" },
            { type: "body", name: "data", refName: "mcpPage", modelType: "input" },
          ],
          returns: { refName: "mcpPage", modelType: "full" },
          guards: ["Admin"],
        },
      },
    },
  });
  const tool = doc.tools.find(({ name }) => name === "rewriteMcpPage");

  test("asks for the agent shape in an argument and inside a model it takes", () => {
    const properties = tool?.inputSchema.properties as Record<string, unknown>;
    expect(properties.body).toEqual(McpNote.agent.schema);
    const defs = tool?.inputSchema.$defs as Record<string, { properties: Record<string, unknown> }>;
    expect(defs.McpPageInput.properties.body).toEqual(McpNote.agent.schema);
  });

  test("promises the agent shape in the result, which is what `mask` reads the value into", () => {
    const defs = tool?.outputSchema?.$defs as Record<string, { properties: Record<string, unknown> }>;
    expect(defs.McpPage.properties.body).toEqual(McpNote.agent.schema);
  });
});
