import { describe, expect, test } from "bun:test";
import { McpUriTemplate } from "./McpUriTemplate";

describe("McpUriTemplate", () => {
  test("builds the two addressable shapes", () => {
    expect(McpUriTemplate.model("agentSession")).toBe("akan://agentSession/{agentSessionId}");
    expect(McpUriTemplate.list("user", "byStatuses", ["statuses", "limit"])).toBe(
      "akan://user/list/byStatuses{?statuses,limit}",
    );
    expect(McpUriTemplate.list("user", "", [])).toBe("akan://user/list");
  });

  test("expands the shapes it builds, encoding the id and repeating an arrayed query arg", () => {
    expect(McpUriTemplate.expand(McpUriTemplate.model("user"), { userId: "a/b" })).toBe("akan://user/a%2Fb");
    expect(
      McpUriTemplate.expand(McpUriTemplate.list("user", "byStatuses", ["statuses", "limit"]), {
        statuses: ["active", "pending"],
      }),
    ).toBe("akan://user/list/byStatuses?statuses=active&statuses=pending");
  });

  test("keeps the root list out of the segment a slice key occupies", () => {
    expect(McpUriTemplate.list("user", "all", [])).toBe("akan://user/list/all");
    expect(McpUriTemplate.parse("akan://user/list/all")).toEqual({ endpointKey: "userListAll", args: {} });
    expect(McpUriTemplate.parse("akan://user/list")).toEqual({ endpointKey: "userList", args: {} });
  });

  test("round-trips a model uri back to its endpoint and id", () => {
    expect(McpUriTemplate.parse("akan://user/6712ab34cd56ef7890123456")).toEqual({
      endpointKey: "user",
      args: { userId: "6712ab34cd56ef7890123456" },
    });
    expect(McpUriTemplate.parse("akan://user/light/6712ab34cd56ef7890123456")).toBeNull();
  });

  test("preserves camelCase in the authority", () => {
    expect(McpUriTemplate.parse("akan://agentSession/abc")?.endpointKey).toBe("agentSession");
  });

  test("maps a list uri to its slice endpoint and query args", () => {
    expect(McpUriTemplate.parse("akan://user/list/byStatuses?statuses=active&limit=20")).toEqual({
      endpointKey: "userListByStatuses",
      args: { statuses: "active", limit: "20" },
    });
    expect(McpUriTemplate.parse("akan://user/list?limit=20")).toEqual({
      endpointKey: "userList",
      args: { limit: "20" },
    });
  });

  test("collects a repeated query key into an array so an arrayed search arg survives", () => {
    expect(McpUriTemplate.parse("akan://user/list/byStatuses?statuses=active&statuses=paused")?.args).toEqual({
      statuses: ["active", "paused"],
    });
  });

  test("rejects anything that is not one of the two shapes", () => {
    expect(McpUriTemplate.parse("https://example.com/user/1")).toBeNull();
    expect(McpUriTemplate.parse("akan://user")).toBeNull();
    expect(McpUriTemplate.parse("akan://user//1")).toBeNull();
    expect(McpUriTemplate.parse("akan://user/1/2/3")).toBeNull();
    expect(McpUriTemplate.parse("akan://user/anything/1")).toBeNull();
    expect(McpUriTemplate.parse("akan://user/list")?.endpointKey).toBe("userList");
  });

  test("reads an undecodable escape as unknown rather than throwing", () => {
    expect(McpUriTemplate.parse("akan://user/%")).toBeNull();
    expect(McpUriTemplate.parse("akan://user/list/%E0%A4%A")).toBeNull();
    expect(McpUriTemplate.parse("akan://user/list?q=%ZZ")?.args).toEqual({ q: "%ZZ" });
  });
});
