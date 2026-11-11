import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { EndpointReach } from "./endpointReach";

const fileOf = (file: string, content: string) => ({
  file,
  sourceFile: ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true),
});

describe("EndpointReach", () => {
  test("follows an endpoint or a slice through its service's own and other services' methods, not a job", () => {
    const reach = new EndpointReach(
      [
        fileOf(
          "apps/demo/lib/court/court.signal.ts",
          `export class CourtInternal extends internal(srv.court, ({ cron }) => ({
  sweep: cron("0 * * * *").exec(function () { return this.courtService.sweep(); }),
})) {}
export class CourtSlice extends slice(srv.court, { guards: { root: Admin } }, (init) => ({
  inOrg: init().exec(function (orgId) { return this.courtService.queryInOrg(orgId); }),
})) {}
export class CourtEndpoint extends endpoint(srv.court, ({ mutation }) => ({
  assign: mutation(Boolean).exec(function (id) { return this.courtService.assign(id); }),
})) {}
`,
        ),
      ],
      [
        fileOf(
          "apps/demo/lib/court/court.service.ts",
          `export class CourtService extends serve(db.court, () => ({})) {
  queryInOrg(orgId: string) { return { orgId }; }
  async assign(id: string) { return await this.#pick(id); }
  async #pick(id: string) { return await this.pcService.claim(id); }
  async sweep() { return await this.#pick("all"); }
}
`,
        ),
        fileOf(
          "libs/shared/lib/_pc/pc.service.ts",
          `export class PcService extends serve("pc", () => ({})) {
  async claim(id: string) { return id; }
  async release(id: string) { return id; }
}
`,
        ),
      ],
    );

    expect(EndpointReach.serviceOf("libs/shared/lib/_pc/pc.service.ts")).toBe("pc");
    expect(
      ["court.queryInOrg", "court.assign", "court.#pick", "pc.claim", "court.sweep", "pc.release"].map((key) => {
        const [service = "", method = ""] = key.split(".");
        return reach.reaches(service, method);
      }),
    ).toEqual([true, true, true, true, false, false]);
  });
});
