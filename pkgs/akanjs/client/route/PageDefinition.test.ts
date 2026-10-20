import { describe, expect, test } from "bun:test";
import { ID, Int } from "akanjs/base";
import { AppScope } from "akanjs/fetch";
import type { ReactNode } from "react";
import type { PageModule } from "../csrTypes";
import { page } from "./routeBuilders";

const ticketId = "507f1f77bcf86cd799439011";

describe(".app() stage", () => {
  test("hands each app's element to the render as the argument of its name, its load given the page's args", async () => {
    const loads: unknown[] = [];
    const definition = page()
      .param("ticketId", ID)
      .search("tab", Int)
      .app("showTicket", "Show one ticket.", (args) => {
        loads.push(args);
        return `ticket:${args.ticketId}`;
      })
      .app("showHistory", "Show the ticket's history.", async ({ ticketId }) => `history:${ticketId}`)
      .render(({ ticketId, showTicket, showHistory }) => {
        const elements: ReactNode[] = [showTicket, showHistory];
        return `${ticketId}=${elements.join("|")}`;
      });
    const mod = definition.toRouteModule() as PageModule;
    expect(await mod.default?.({ params: { lang: "ko", ticketId }, searchParams: { tab: "2" } })).toBe(
      `${ticketId}=ticket:${ticketId}|history:${ticketId}`,
    );
    expect(loads).toEqual([{ lang: "ko", ticketId, tab: 2 }]);
  });

  test("lists each app with the page's arguments as its tool input", () => {
    const definition = page()
      .param("ticketId", ID, { desc: "The ticket to show." })
      .search("tags", [String])
      .app("showTicket", "Show one ticket.", () => null)
      .render(() => null);
    expect(definition.appMetas).toEqual([
      {
        name: "showTicket",
        description: "Show one ticket.",
        arguments: [
          { name: "ticketId", description: "The ticket to show.", required: true },
          { name: "tags", description: "Comma-separated list.", required: false },
        ],
      },
    ]);
    expect(page().render(() => null).appMetas).toEqual([]);
  });

  test("loads one app alone, inside its own scope through an await, and names an app the page lacks", async () => {
    const scopes: (string | undefined)[] = [];
    const definition = page()
      .param("ticketId", ID)
      .app("showTicket", "Show one ticket.", async (args) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        scopes.push(AppScope.current());
        return args.ticketId;
      })
      .render(() => {
        throw new Error("the render never runs for an app");
      });
    expect(await definition.loadApp("showTicket", { lang: "en", ticketId })).toBe(ticketId);
    expect(scopes).toEqual(["showTicket"]);
    expect(AppScope.current()).toBeUndefined();
    await expect(definition.loadApp("showNothing", { lang: "en", ticketId })).rejects.toThrow(
      'this page declares no app "showNothing"',
    );
  });

  test("refuses a name the render already receives, in either order", () => {
    const twice = 'names "ticketId" twice';
    expect(() =>
      page()
        .param("ticketId", ID)
        // @ts-expect-error a param of that name already reaches the render
        .app("ticketId", "x", () => null),
    ).toThrow(twice);
    expect(() =>
      page()
        .app("ticketId", "x", () => null)
        // @ts-expect-error an app of that name already reaches the render
        .param("ticketId", ID),
    ).toThrow(twice);
    expect(() =>
      page()
        .app("tab", "x", () => null)
        // @ts-expect-error an app of that name already reaches the render
        .search("tab", String),
    ).toThrow('names "tab" twice');
    expect(() =>
      page()
        .app("showTicket", "x", () => null)
        // @ts-expect-error two apps would share one render argument
        .app("showTicket", "y", () => null),
    ).toThrow('names "showTicket" twice');
    // @ts-expect-error every route receives lang
    expect(() => page().app("lang", "x", () => null)).toThrow('app "lang"');
  });

  test("refuses an app named like the page's prompt, a name MCP would not list, and an empty description", () => {
    const both = 'names "same" as both an app and its prompt';
    expect(() =>
      page()
        .prompt("same", "x")
        .app("same", "y", () => null),
    ).toThrow(both);
    expect(() =>
      page()
        .app("same", "y", () => null)
        .prompt("same", "x"),
    ).toThrow(both);
    expect(() => page().app("has space", "x", () => null)).toThrow("must match");
    expect(() => page().app("ok", " ", () => null)).toThrow('app "ok" needs a description');
  });
});
