import { describe, expect, test } from "bun:test";
import { McpUriTemplate } from "./McpUriTemplate";

describe("McpUriTemplate", () => {
  test("builds the three addressable shapes", () => {
    expect(McpUriTemplate.model("agentSession")).toBe("akan://agentSession/{agentSessionId}");
    expect(McpUriTemplate.light("agentSession")).toBe("akan://agentSession/light/{agentSessionId}");
    expect(McpUriTemplate.list("user", "byStatuses", ["statuses", "limit"])).toBe(
      "akan://user/list/byStatuses{?statuses,limit}",
    );
    expect(McpUriTemplate.list("user", "", [])).toBe("akan://user/list");
  });

  test("keeps the root list out of the segment a slice key occupies", () => {
    // A slice may legally be called `all`, so a root list published at `…/list/all` would take the uri that
    // slice's own list needs and answer it with a different endpoint.
    expect(McpUriTemplate.list("user", "all", [])).toBe("akan://user/list/all");
    expect(McpUriTemplate.parse("akan://user/list/all")).toEqual({ endpointKey: "userListAll", args: {} });
    expect(McpUriTemplate.parse("akan://user/list")).toEqual({ endpointKey: "userList", args: {} });
  });

  test("round-trips a model uri back to its endpoint and id", () => {
    expect(McpUriTemplate.parse("akan://user/6712ab34cd56ef7890123456")).toEqual({
      endpointKey: "user",
      args: { userId: "6712ab34cd56ef7890123456" },
    });
    expect(McpUriTemplate.parse("akan://user/light/6712ab34cd56ef7890123456")).toEqual({
      endpointKey: "lightUser",
      args: { userId: "6712ab34cd56ef7890123456" },
    });
  });

  test("preserves camelCase in the authority", () => {
    // A WHATWG `URL` may normalize the authority of a non-special scheme; a lowercased `agentsession` would
    // silently stop matching its model, which is why parsing is done by hand.
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

  test("rejects anything that is not one of the three shapes", () => {
    expect(McpUriTemplate.parse("https://example.com/user/1")).toBeNull();
    expect(McpUriTemplate.parse("akan://user")).toBeNull();
    expect(McpUriTemplate.parse("akan://user//1")).toBeNull();
    expect(McpUriTemplate.parse("akan://user/1/2/3")).toBeNull();
    // `light` and `list` are reserved, so a two-segment uri may not use one as an id — `…/list` reads as the
    // root list rather than as a document whose id is the word.
    expect(McpUriTemplate.parse("akan://user/light")).toBeNull();
  });

  test("reads an undecodable escape as unknown rather than throwing", () => {
    // `decodeURIComponent` throws `URIError` on these, and the router's catch would turn a caller's typo into a
    // 500 with a stack in the log — on a method an agent may call with any string.
    expect(McpUriTemplate.parse("akan://user/%")).toBeNull();
    expect(McpUriTemplate.parse("akan://user/light/%E0%A4%A")).toBeNull();
    // The query half never needed the guard: `URLSearchParams` reads a bad escape as literal text.
    expect(McpUriTemplate.parse("akan://user/list?q=%ZZ")?.args).toEqual({ q: "%ZZ" });
  });
});
