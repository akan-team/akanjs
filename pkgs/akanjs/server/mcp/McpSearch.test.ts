import { describe, expect, test } from "bun:test";
import type { Dayjs } from "akanjs/base";
import type { McpTool } from "../../signal/mcp";
import { McpFoundTools, type McpFoundToolsStore } from "./McpFoundTools";
import { McpSearch } from "./McpSearch";

const tool = (name: string, description: string): McpTool => ({ name, description, inputSchema: { type: "object" } });

const catalogue = [
  tool("createTicket", "Opens a support ticket on a project."),
  tool("ticketListInOrg", "Lists an organization's tickets."),
  tool("renameTitle", "Renames an item."),
  tool("removeTicket", "Deletes a ticket for good."),
  tool("projectInOrg", "Lists the projects of an org."),
];

const names = (found: Awaited<ReturnType<McpSearch["find"]>>) =>
  "error" in found ? found.error : found.tools.map((entry) => entry.name);

describe("McpSearch.find", () => {
  test("ranks a name match over a description match, ties in catalogue order", async () => {
    const search = new McpSearch({ listed: [] }, null);
    expect(names(await search.find(catalogue, { query: "open ticket" }, "a"))).toEqual([
      "createTicket",
      "ticketListInOrg",
      "removeTicket",
    ]);
    expect(names(await search.find(catalogue, { query: "projects" }, "a"))).toEqual(["projectInOrg", "createTicket"]);
    expect(names(await search.find(catalogue, { query: "information" }, "a"))).toEqual([]);
  });

  test("finds a tool by its keywords in a Korean query, particles and endings attached", async () => {
    const keywords = { createTicket: ["문의 접수", "티켓 생성"], projectInOrg: ["프로젝트 목록"] };
    const search = new McpSearch({ listed: [], keywords }, null);
    expect(names(await search.find(catalogue, { query: "문의를 접수해줘" }, "a"))).toEqual(["createTicket"]);
    expect(names(await search.find(catalogue, { query: "프로젝트들 보여줘" }, "a"))).toEqual(["projectInOrg"]);
    expect(names(await new McpSearch({ listed: [] }, null).find(catalogue, { query: "문의를 접수해줘" }, "a"))).toEqual(
      [],
    );
  });

  test("leaves out what is listed already, and honours the limit up to its ceiling", async () => {
    const search = new McpSearch({ listed: ["createTicket"], limit: 1 }, null);
    expect(names(await search.find(catalogue, { query: "ticket" }, "a"))).toEqual(["ticketListInOrg"]);
    expect(names(await search.find(catalogue, { query: "ticket", limit: 5 }, "a"))).toEqual([
      "ticketListInOrg",
      "removeTicket",
    ]);
    const many = Array.from({ length: 30 }, (_, index) => tool(`ticket${index}`, "A ticket."));
    expect(names(await search.find(many, { query: "ticket", limit: 100 }, "a"))).toHaveLength(McpSearch.maxLimit);
  });

  test("refuses an empty query", async () => {
    const search = new McpSearch({ listed: [] }, null);
    expect(await search.find(catalogue, { query: "  " }, "a")).toEqual({
      error: "`query` names what the tool should do, in words.",
    });
  });

  test("says the listing changed only when a find adds a tool the caller had not found", async () => {
    const search = new McpSearch({ listed: [] }, null);
    const first = await search.find(catalogue, { query: "rename" }, "a");
    const again = await search.find(catalogue, { query: "rename" }, "a");
    const other = await search.find(catalogue, { query: "rename" }, "b");
    expect("added" in first && first.added).toBe(true);
    expect("added" in again && again.added).toBe(false);
    expect("added" in other && other.added).toBe(true);
    expect(await search.find(catalogue, { query: "nothing matches" }, "c")).toEqual({ tools: [], added: false });
  });
});

describe("McpFoundTools", () => {
  const memoryStore = () => {
    const held = new Map<string, unknown>();
    const expiries: Dayjs[] = [];
    const store: McpFoundToolsStore = {
      get: async <T>(topic: string, key: string) => held.get(`${topic}:${key}`) as T | undefined,
      set: async (topic: string, key: string, value: unknown, option?: { expireAt?: Dayjs }) => {
        held.set(`${topic}:${key}`, value);
        if (option?.expireAt) expiries.push(option.expireAt);
      },
    } as McpFoundToolsStore;
    return { store, expiries };
  };

  test("keeps each caller's found tools in the cache with an expiry", async () => {
    const { store, expiries } = memoryStore();
    const found = new McpFoundTools(store);
    expect(await found.add("a", ["createTicket"])).toBe(true);
    expect(await new McpFoundTools(store).of("a")).toEqual(["createTicket"]);
    expect(await found.of("b")).toEqual([]);
    expect(expiries[0]?.valueOf()).toBeGreaterThan(Date.now() + McpFoundTools.ttlMs - 60_000);
  });

  test("caps a caller's set, keeping the latest finds", async () => {
    const found = new McpFoundTools(null);
    const names = Array.from({ length: McpFoundTools.perCaller + 3 }, (_, index) => `tool${index}`);
    await found.add("a", names);
    const kept = await found.of("a");
    expect(kept).toHaveLength(McpFoundTools.perCaller);
    expect(kept.at(-1)).toBe(names.at(-1));
    expect(kept).not.toContain("tool0");
  });

  test("falls back to this process while the cache fails", async () => {
    const failing = {
      get: async () => {
        throw new Error("cache down");
      },
      set: async () => {
        throw new Error("cache down");
      },
    } as unknown as McpFoundToolsStore;
    const found = new McpFoundTools(failing);
    expect(await found.add("a", ["createTicket"])).toBe(true);
    expect(await found.of("a")).toEqual(["createTicket"]);
  });
});
