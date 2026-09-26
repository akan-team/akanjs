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
  // Legal to send and never sent back — `resolveReturn` strips it — so the two schema sides must disagree here.
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
      // The root slice `slice()` generates: it names one of the model's filters and carries that filter's own
      // args in an `Any`, which publishes nowhere.
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
      // What `init().param("from", Date).search("periodTypes", …)` actually serializes to — a slice's params are
      // required and are not `search`, which is the shape a search-only fixture never exercises.
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
      // Perfectly guarded, perfectly callable, and no business on a shelf — a step of a UI-driven state machine.
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
      // Guarded for a person: `Person` says `static agents = false`, which the serializer resolved onto the entry.
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
      // Takes the model on the way in and gives it back on the way out — the one tool that publishes both halves.
      draftMcpPost: {
        type: "mutation",
        args: [{ type: "body", name: "data", refName: "mcpPost", modelType: "input" }],
        returns: { refName: "mcpPost", modelType: "full" },
        guards: ["Admin"],
      },
      // No guards at all: nobody decided who may reach it, which is what the guarded rule refuses.
      unguardedMcpPost: { type: "mutation", args: [], returns: { refName: "Boolean" } },
      // `[Public]` on a write is having no guard, spelled out — a decision, and still refused.
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
    // Exposure follows the guards, so generated CRUD, every slice and every custom endpoint are all candidates —
    // the same surface HTTP already serves, narrowed per caller at listing time rather than per endpoint at build
    // time. `internalOnly` is here on `Admin` guards alone, which no author had to remember to write twice.
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
    // `lightMcpPost` reads the same row as `mcpPost` under the same guards, trimmed for a page's payload rather
    // than for a model — so it was one more tool per model in a listing an agent pays for on every turn, told
    // apart from the full read by the word "light" and nothing else.
    const doc = new McpDocument(signal());
    expect(names(doc)).not.toContain("lightMcpPost");
    expect(names(doc)).toContain("mcpPost");
    expect(doc.refusals.find(({ key }) => key === "lightMcpPost")?.reason).toContain("`mcpPost`");
    // Never advertised, so the address it used to hold is unreadable rather than merely guarded.
    expect(doc.resolveResource("akan://mcpPost/light/6712ab34cd56ef7890123456")).toBeNull();
    expect(doc.resourceTemplates.map((template) => template.uriTemplate)).not.toContain(
      "akan://mcpPost/light/{mcpPostId}",
    );
  });

  test("keeps out what an author declared `mcp: false` on, at every altitude that declares it", () => {
    // The question guards cannot answer: `requestMcpPostCode` is perfectly guarded and perfectly callable, and is
    // a step of a UI-driven state machine that a model would only ever call by mistake. Curation, not
    // authorization — the reason says so, because somebody will reach for this as a lock.
    const doc = new McpDocument(signal());
    const refusals = Object.fromEntries(doc.refusals.map(({ key, reason }) => [key, reason]));
    expect(names(doc)).not.toContain("requestMcpPostCode");
    expect(refusals.requestMcpPostCode).toContain("HTTP still serves it");
    // One `mcp: false` on a slice covers both entries it generates, which is what an author writing it means.
    expect(names(doc)).not.toContain("mcpPostListQuietSlice");
    expect(names(doc)).not.toContain("mcpPostInsightQuietSlice");
    // Nothing else moved: the declaration is per entry, not per model.
    expect(names(doc)).toContain("mcpPostList");
    expect(names(doc)).toContain("countMcpPosts");
  });

  test("keeps out what a person-only guard protects, at every altitude, and says which guards did it", () => {
    // A guard with `static agents = false` never passes a model, so the entry would be a tool every agent is
    // refused — and hiding it per caller at listing time would still leave it in the document, the boot count and
    // every listing's bytes. Refused like `mcp: false`, and the reason names the guards so the author can find it.
    const doc = new McpDocument(signal());
    const refusals = Object.fromEntries(doc.refusals.map(({ key, reason }) => [key, reason]));
    expect(names(doc)).not.toContain("signMcpPost");
    expect(refusals.signMcpPost).toContain("Admin, Person");
    expect(refusals.signMcpPost).toContain("HTTP still serves it");
    expect(names(doc)).not.toContain("mcpPostListPersonSlice");
    expect(names(doc)).not.toContain("mcpPostInsightPersonSlice");
    // The generated verbs read the signal's own verb map, the shape `mcp` already travels in.
    const withMap = signal();
    withMap.mcpPost.agents = { remove: false };
    const mapped = new McpDocument(withMap);
    expect(names(mapped)).not.toContain("removeMcpPost");
    expect(names(mapped)).toContain("createMcpPost");
    expect(names(mapped)).toContain("mcpPost");
  });

  test("takes the generated verbs the module map names off the shelf, and leaves the rest", () => {
    // The `mcp` map mirrors the `guards` map `slice()` takes, key for key and scope for scope: it narrows the
    // root slice and the generated CRUD, and never reaches a named slice or a custom endpoint.
    const withMap = signal();
    const post = withMap.mcpPost;
    if (!post) throw new Error("fixture");
    post.mcp = { create: false, update: false, remove: false };
    const exposed = names(new McpDocument(withMap));
    expect(exposed).not.toContain("createMcpPost");
    expect(exposed).not.toContain("updateMcpPost");
    expect(exposed).not.toContain("removeMcpPost");
    // Reads are untouched, and so is a custom mutation that happens to write the same model.
    expect(exposed).toContain("mcpPost");
    expect(exposed).toContain("mcpPostList");
    expect(exposed).toContain("draftMcpPost");
  });

  test("says what the listing costs, and which signals it went to", () => {
    // MCP has no shared component section and forbids a `$ref` across entries, so every entry inlines the schema
    // of every model it mentions. The number is nobody's intuition, and a catalogue nobody can size is one
    // nobody narrows.
    const doc = new McpDocument(signal());
    const cost = doc.listingCost;
    const entries = [...doc.tools];
    expect(cost.bytes).toBe(entries.reduce((sum, entry) => sum + JSON.stringify(entry).length, 0));
    expect(cost.bySignal.map(({ refName }) => refName)).toEqual(["mcpPost"]);
    expect(cost.bySignal[0]?.entries).toBe(entries.length);
    // Memoized: the report builds it at boot and a listing is re-derived per caller.
    expect(doc.listingCost).toBe(cost);
  });

  test("readOnly drops every mutation whatever its guards allow", () => {
    // The deployment-level valve, not the exposure decision: `publishMcpPost` is guarded and would publish.
    const exposed = names(new McpDocument(signal(), { readOnly: true }));
    expect(exposed).not.toContain("publishMcpPost");
    expect(exposed).toContain("mcpPostList");
  });

  test("refuses shapes MCP cannot carry, and everything the guards do not admit", () => {
    const exposed = names(new McpDocument(signal()));
    // `Any` has no schema to publish.
    expect(exposed).not.toContain("rawMcpPost");
    // An `Any` arg is left out of the schema, so one that must be filled leaves a tool that can only fail.
    expect(exposed).not.toContain("importMcpPost");
    // The guarded rule, in its two shapes: no guards at all, and a write whose only guard is `Public`.
    expect(exposed).not.toContain("undeclaredMcpPost");
    expect(exposed).not.toContain("unguardedMcpPost");
    expect(exposed).not.toContain("wipeMcpPosts");
    expect(exposed).toContain("publishMcpPost");
  });

  test("says why every candidate it kept out was kept out, instead of dropping it silently", () => {
    // Fail-closed and, before this, silent. It matters more now that nobody writes an opt-in: there is no absent
    // flag to explain a missing tool, so this list is the only place the answer exists. Printed at boot.
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
    // The two halves of the guarded rule read differently, because they are different mistakes: one is an omission
    // and the other is a decision that is still wrong for a write.
    expect(refusals.undeclaredMcpPost).toContain("declares no guards");
    expect(refusals.wipeMcpPosts).toContain("`[Public]` is having none");
    // Names the argument: "it has an `Any` argument" still leaves an author hunting for which one.
    expect(refusals.importMcpPost).toContain("`payload`");
  });

  test("keeps hidden and secret field names out of the output schema and in the input schema", () => {
    // `resolveReturn` strips both from every response, so an output schema naming them promises a property no
    // answer carries — and on a real model the names are the leak: `password`, `accountId`, `phone` published as
    // readable. The input side is a different shape and legitimately takes them.
    const doc = new McpDocument(signal());
    const draft = doc.tools.find((tool) => tool.name === "draftMcpPost");
    const input = draft?.inputSchema.$defs as Record<string, { properties: object }>;
    const output = draft?.outputSchema?.$defs as Record<string, { properties: object }>;
    expect(Object.keys(input.McpPostInput.properties)).toContain("draftKey");
    expect(Object.keys(output.McpPost.properties)).not.toContain("draftKey");
    expect(Object.keys(output.McpPost.properties)).toContain("title");
  });

  test("reports the read-only valve as a refusal like any other", () => {
    // The reason this switch defaults off is that a second switch silently unlisting a deliberately exposed
    // endpoint gives its author no way to see why. It now says so rather than relying on the default.
    const refusal = new McpDocument(signal(), { readOnly: true }).refusals.find(({ key }) => key === "publishMcpPost");
    expect(refusal?.reason).toContain("read-only");
  });

  test("leaves an Any argument out of the schema instead of publishing an empty one", () => {
    const doc = new McpDocument(signal());
    const list = doc.tools.find((tool) => tool.name === "mcpPostList");
    // The root list's `args` carries whatever the named filter takes. `Any` publishes as `{}`, which tells a model
    // nothing — the same reason an `Any` return is refused — and a value sent for it is refused by name at the
    // server, like any other argument the published schema does not carry. The key beside it is a plain string,
    // so a model can still pick a filter, and the values it may pick are published with it.
    const properties = (list?.inputSchema.properties ?? {}) as Record<string, unknown>;
    expect(Object.keys(properties)).toEqual(["queryKey", "skip", "limit", "sort"]);
    // Nullability rides in the type rather than an `anyOf` wrapper, and the enum lists `null` so both halves agree.
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
    // `slice()` generates the `""` slice and `baseSliceDictionary` fills its text last, so these two would
    // otherwise publish as "Slice List - Universal" — a placeholder in the field a model picks a tool by, with
    // nowhere for the module author to write over it.
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
    // A named slice is the author's own text and is left alone.
    expect(doc.tools.find((tool) => tool.name === "mcpPostListByAuthor")?.title).toBeUndefined();
    expect(doc.resourceTemplates.find((template) => template.name === "mcpPostList")?.title).toBe("Post");
  });

  test("adds what the model is to the generated CRUD text, which only says the verb", () => {
    // `getBaseSignalDictionary` writes "Get Post" as both title and description and is assigned last, so these
    // five have no author-writable text either. Appended rather than substituted: on `removeMcpPost` a bare model
    // description would read as if the tool returned one.
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
    // A custom endpoint is the author's own text and is left exactly as written.
    expect(doc.tools.find((tool) => tool.name === "countMcpPosts")?.description).toBeUndefined();
  });

  test("marks path args required and leaves every search arg optional", () => {
    const doc = new McpDocument(signal());
    const single = doc.tools.find((tool) => tool.name === "mcpPost");
    expect(single?.inputSchema.required).toEqual(["mcpPostId"]);
    const list = doc.tools.find((tool) => tool.name === "mcpPostListByAuthor");
    // `skip`/`limit`/`sort` are generated without a nullable flag; reading one would demand them.
    expect(Object.keys(list?.inputSchema.properties as object)).toEqual(["authorId", "skip", "limit", "sort"]);
    expect(list?.inputSchema.required).toBeUndefined();
    // A slice may declare required params of its own, and those do have to be demanded.
    expect(doc.tools.find((tool) => tool.name === "mcpPostListInPeriod")?.inputSchema.required).toEqual(["from"]);
  });

  test("closes each tool's schema over the models it mentions", () => {
    const doc = new McpDocument(signal());
    const tool = doc.tools.find((candidate) => candidate.name === "mcpPost");
    expect(tool?.outputSchema?.$ref).toBe("#/$defs/McpPost");
    // A `$ref` may not be dereferenced over the network, so every model travels inside the tool that names it —
    // and by default a nested model is named rather than inlined, so the closure stops at the returned model.
    const defs = tool?.outputSchema?.$defs as Record<string, { properties: Record<string, unknown> }>;
    expect(Object.keys(defs)).toEqual(["McpPost"]);
    expect(defs.McpPost.properties.tag).toEqual({ type: ["object", "null"], description: "McpTag" });
    const full = new McpDocument(signal(), { outputSchema: "full" }).tools.find(
      (candidate) => candidate.name === "mcpPost",
    );
    expect(Object.keys(full?.outputSchema?.$defs as object)).toEqual(["McpPost", "McpTag"]);
  });

  test("asks for a relation's id in a request schema, which is what the wire carries", () => {
    // `serialize` sends a relation field as its id and the server never converts an object back, so a schema that
    // showed the related model asked an agent for a shape the document layer cannot take.
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
    // `structuredContent` is an object, so `null` cannot ride there any more than an array can. Declaring an
    // `outputSchema` obliges every result to match it, and the first call that finds nothing would break that
    // promise — the official client SDK parses the result against the schema and throws on a successful call.
    const doc = new McpDocument(signal());
    const endpoint = { returns: { refName: "mcpPost", modelType: "full", nullable: true } };
    expect(doc.tools.find((tool) => tool.name === "findMcpPost")?.outputSchema).toBeUndefined();
    expect(McpDocument.structuredContent(endpoint as never, null)).toBeUndefined();
    // A found one still travels structured; only the empty answer has nowhere to go.
    expect(McpDocument.structuredContent(endpoint as never, { id: "1" })).toEqual({ id: "1" });
    // A nullable *list* keeps its schema: the wrapper is an object whatever rides inside it.
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
      // A slice's required params belong in the template too: without them the uri addresses a read that can
      // only fail. `parse` reads every query key back, so both kinds round-trip through form expansion.
      "akan://mcpPost/list/inPeriod{?from,periodTypes,skip,limit,sort}",
      "akan://mcpPost/list/internalOnly{?skip,limit,sort}",
    ]);
    // An insight is an aggregate with nothing to point a uri at.
    expect(doc.resourceTemplates.some((template) => template.name.includes("Insight"))).toBe(false);
    expect(doc.resources).toEqual([]);
  });

  test("gives a custom endpoint a tool but never an address", () => {
    // Only the generated reads have a uri shape. Building one for a custom endpoint from the model's own key
    // published `akan://mcpPost/{mcpPostId}` twice — once under `summaryMcpPost` — where `parse` sends it to
    // `mcpPost` regardless, so the advertised read answered somebody else's endpoint, and `summaryMcpPost`'s own
    // `status` argument was nowhere in the uri at all.
    const doc = new McpDocument(signal());
    expect(names(doc)).toContain("summaryMcpPost");
    expect(doc.resourceTemplates.map((template) => template.name)).not.toContain("summaryMcpPost");
    expect(doc.resourceTemplates.filter((t) => t.uriTemplate === "akan://mcpPost/{mcpPostId}")).toHaveLength(1);
    expect(doc.resolveResource("akan://mcpPost/6712ab34cd56ef7890123456")?.exposed.key).toBe("mcpPost");
  });

  test("names what it published with no description of its own", () => {
    // The scanner cannot answer this: it reads source, where `expose` is visible only as a literal in the builder
    // call, and where the model `.desc()` a generated entry borrows is not that entry's description at all.
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
    // "Get Post" is the framework's own text, and there is no model `.desc()` to append to it.
    expect(undescribed.mcpPost).toContain("`mcpPost` has no `.desc()`");
    expect(undescribed.mcpPostList).toContain("`mcpPost` has no `.desc()`");
    expect(undescribed.findMcpPost).toContain("no dictionary `.desc()`");
    // Nothing refused is in here — it was never published.
    expect(undescribed.unguardedMcpPost).toBeUndefined();
    // Writing the model's own description is what clears all six generated entries at once.
    const described = new McpDocument(signal(), {
      resolveDescription: (key) => ({ ...text, "mcpPost.modelDesc": "An article somebody wrote" })[key],
    });
    expect(described.undescribed.map(({ key }) => key)).not.toContain("mcpPost");
    expect(described.undescribed.map(({ key }) => key)).not.toContain("mcpPostList");
  });

  test("resolves a uri only when its endpoint was advertised", () => {
    const doc = new McpDocument(signal());
    expect(doc.resolveResource("akan://mcpPost/6712ab34cd56ef7890123456")?.exposed.key).toBe("mcpPost");
    // Never advertised: an opted-out endpoint has to be unreachable, not merely refused later by its guards.
    expect(doc.resolveResource("akan://mcpTag/6712ab34cd56ef7890123456")).toBeNull();
    // A refused endpoint has to be unreachable, not merely refused later by its guards.
    expect(doc.resolveResource("akan://mcpPost/list/undeclared")).toBeNull();
  });

  test("expands a tool's template into the uri its call answers to, and nothing for a tool without one", () => {
    // A page prompt attaches what the screen fetched under the address `resources/read` would answer for it.
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
