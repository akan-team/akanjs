import { describe, expect, test } from "bun:test";
import ts from "typescript";
import type { SourceFileInfo } from "./qualityScanner";
import { SignalMutationIndex } from "./signalMutationIndex";

const fileOf = (file: string, content: string): SourceFileInfo => ({
  file,
  absolutePath: `/repo/${file}`,
  content,
  sourceFile: ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
});

const ticketSignal = fileOf(
  "apps/demo/lib/ticket/ticket.signal.ts",
  `
export class TicketSlice extends slice(srv.ticket, { guards: { root: Admin, get: Public, cru: User } }, () => ({})) {}

export class TicketEndpoint extends endpoint(srv.ticket.with(srv.util.security), ({ query, mutation: write, message }) => ({
  approveTicket: write(cnst.Ticket, { guards: [User] })
    .param("ticketId", ID)
    .exec(async function (ticketId) {
      return await this.ticketService.approve(ticketId);
    }),
  ticketCount: query(Int, { guards: [User] }).exec(async function () {
    return 0;
  }),
  nudgeTicket: message(Boolean, { guards: [User] })
    .msg("ticketId", ID)
    .exec(function (ticketId) {
      return !!ticketId;
    }),
}))
{}
`,
);

describe("SignalMutationIndex", () => {
  test("reads each endpoint's kind from its declaration, aliased builders included", () => {
    const index = new SignalMutationIndex([ticketSignal]);
    expect(index.isMutation("apps/demo/page/x.tsx", "approveTicket")).toBe(true);
    expect(index.isMutation("apps/demo/page/x.tsx", "ticketCount")).toBe(false);
    expect(index.isMutation("apps/demo/page/x.tsx", "initTicketInOrg")).toBe(false);
  });

  test("counts a socket message as a mutation, its policy after the message arguments", () => {
    const index = new SignalMutationIndex([ticketSignal]);
    expect(index.isMutation("apps/demo/page/x.tsx", "nudgeTicket")).toBe(true);
    expect(index.policyIndexOf("apps/demo/page/x.tsx", "nudgeTicket")).toBe(1);
  });

  test("counts the CRUD a model's slice generates as mutations", () => {
    const index = new SignalMutationIndex([ticketSignal]);
    for (const name of ["createTicket", "updateTicket", "removeTicket", "mergeTicket", "addTicketFiles"])
      expect(index.isMutation("apps/demo/page/x.tsx", name)).toBe(true);
    expect(index.isMutation("apps/demo/page/x.tsx", "ticket")).toBe(false);
  });

  test("places each mutation's policy right after the arguments the client takes", () => {
    const signal = fileOf(
      "apps/demo/lib/item/item.signal.ts",
      `export class ItemSlice extends slice(srv.item, { guards: { root: Admin, cru: User } }, () => ({})) {}
export class ItemEndpoint extends endpoint(srv.item, ({ query, mutation }) => ({
  noteItem: mutation(cnst.Item, { guards: [User] })
    .param("itemId", ID)
    .body("note", String)
    .search("tag", String)
    .with(Ip)
    .exec(async function (itemId, note, tag, ip) {
      return await this.itemService.note(itemId, note, tag, ip);
    }),
  touchItems: mutation(Boolean, { guards: [User] }).exec(() => true),
  itemCount: query(Int, { guards: [User] }).param("itemId", ID).exec(() => 0),
})) {}`,
    );
    const index = new SignalMutationIndex([signal]);
    const policyOf = (name: string) => index.policyIndexOf("apps/demo/page/x.tsx", name);
    expect(policyOf("noteItem")).toBe(3);
    expect(policyOf("touchItems")).toBe(0);
    expect([policyOf("createItem"), policyOf("removeItem")]).toEqual([1, 1]);
    expect([policyOf("updateItem"), policyOf("mergeItem"), policyOf("addItemFiles")]).toEqual([2, 2, 2]);
    expect(policyOf("itemCount")).toBeNull();
    expect(policyOf("unknownItem")).toBeNull();
  });

  test("reads a builder given as one parameter and a block body", () => {
    const signal = fileOf(
      "libs/shared/lib/_util/util.signal.ts",
      `export class UtilEndpoint extends endpoint(srv.util, (b) => {
  return { ping: b.query(String, { guards: [Public] }).exec(() => "pong"), touch: b.mutation(Boolean, { guards: [User] }).exec(() => true) };
}) {}`,
    );
    const index = new SignalMutationIndex([signal]);
    expect(index.isMutation("libs/shared/page/x.tsx", "touch")).toBe(true);
    expect(index.isMutation("libs/shared/page/x.tsx", "ping")).toBe(false);
  });

  test("scopes an app's endpoints to that app and every lib's to all of them", () => {
    const otherApp = fileOf(
      "apps/other/lib/_other/other.signal.ts",
      `export class OtherEndpoint extends endpoint(srv.other, ({ mutation }) => ({ approveTicket: mutation(Boolean, {}).exec(() => true) })) {}`,
    );
    const lib = fileOf(
      "libs/shared/lib/_shared/shared.signal.ts",
      `export class SharedEndpoint extends endpoint(srv.shared, ({ mutation }) => ({ ticketCount: mutation(Boolean, {}).exec(() => true), touchShared: mutation(Boolean, {}).exec(() => true) })) {}`,
    );
    const index = new SignalMutationIndex([ticketSignal, otherApp, lib]);
    expect(index.isMutation("apps/demo/page/x.tsx", "touchShared")).toBe(true);
    expect(index.isMutation("apps/demo/page/x.tsx", "ticketCount")).toBe(false);
    expect(index.isMutation("libs/shared/page/x.tsx", "approveTicket")).toBe(false);
    expect(index.isMutation("apps/third/page/x.tsx", "approveTicket")).toBe(false);
  });

  test("ignores signal tests and specs", () => {
    const spec = fileOf(
      "apps/demo/lib/ticket/ticket.signal.spec.ts",
      `endpoint(srv.ticket, ({ mutation }) => ({ fixture: mutation(Boolean, {}).exec(() => true) }));`,
    );
    expect(new SignalMutationIndex([spec]).isMutation("apps/demo/page/x.tsx", "fixture")).toBe(false);
  });
});
