import { describe, expect, it } from "bun:test";
import ts from "typescript";
import { AkanGraphDiff } from "./akanGraphDiff";
import { AkanIndex } from "./akanIndex";

const root = "/ws";
const files: Record<string, string> = {
  "libs/shared/lib/file/file.constant.ts": `import { via } from "akanjs/constant";
export class FileInput extends via((field) => ({
  url: field(String),
})) {}
export class File extends via(FileInput, (resolve) => ({})) {}
`,
  "libs/shared/lib/file/file.service.ts": `import { serve } from "akanjs/service";
import * as db from "../db";
export class FileService extends serve(db.file, () => ({})) {}
`,
  "libs/shared/lib/__scalar/geo/geo.constant.ts": `import { via } from "akanjs/constant";
export class Geo extends via((field) => ({
  lat: field(Number),
})) {}
`,
  "apps/demo/lib/memo/memo.constant.ts": `import { enumOf } from "akanjs/base";
import { via } from "akanjs/constant";
import { File } from "../../../../libs/shared/lib/file/file.constant";
import { Geo } from "../../../../libs/shared/lib/__scalar/geo/geo.constant";
export class MemoStatus extends enumOf("memoStatus", ["draft", "shared"] as const) {}
export class MemoInput extends via((field) => ({
  name: field(String),
  images: field([File]),
  place: field(Geo).optional(),
})) {}
export class MemoObject extends via(MemoInput, (field) => ({
  status: field(MemoStatus, { default: "draft" }),
})) {}
export class Memo extends via(MemoObject, (resolve) => ({})) {}
`,
  "apps/demo/lib/memo/memo.document.ts": `import { by, from, into } from "akanjs/document";
import * as cnst from "../cnst";
export class MemoFilter extends from(cnst.Memo, (filter) => ({
  query: {
    byName: filter().arg("name", String).query((name) => ({ name })),
  },
  sort: {},
})) {}
export class MemoModel extends into(Memo, MemoFilter, cnst.memo, () => ({})) {}
`,
  "apps/demo/lib/memo/memo.service.ts": `import { serve } from "akanjs/service";
import * as db from "../db";
export class MemoService extends serve(db.memo, () => ({})) {
  async share(id: string) {
    const memo = await this.getMemo(id);
    return await this.touch(memo.id);
  }
  async touch(id: string) {
    return await this.listByName(id);
  }
}
`,
  "apps/demo/lib/memo/memo.signal.ts": `import { endpoint, slice } from "akanjs/signal";
import * as srv from "../srv";
export class MemoSlice extends slice(srv.memo, { guards: { root: Admin, get: Public } }, (init) => ({
  inPublic: init({ guards: [Public] })
    .search("name", String)
    .live()
    .exec(function (name) {
      return this.memoService.queryByName(name);
    }),
})) {}
export class MemoEndpoint extends endpoint(srv.memo, ({ mutation }) => ({
  shareMemo: mutation(cnst.Memo, { guards: [Owner] }).exec(async function (id) {
    return await this.memoService.share(id);
  }),
})) {}
`,
  "apps/demo/lib/memo/memo.store.ts": `import { store } from "akanjs/store";
import { fetch, sig } from "../useClient";
export class MemoStore extends store(sig.memo, () => ({})) {
  async shareMemo(id: string) {
    this.setMemo(await fetch.shareMemo(id));
    await this.refreshAll();
  }
  async refreshAll() {}
}
`,
  "apps/demo/lib/memo/Memo.Util.tsx": `import { st } from "@apps/demo/client";
export const Share = ({ id }: { id: string }) => <button onClick={() => st.do.shareMemo(id)} />;
export const Rename = () => st.do.setNameOnMemo("x");
export const Plain = ({ option }: { option: { memoId: string } }) => option.memoId;
`,
  "apps/demo/page/memo.tsx": `import { fetch } from "@apps/demo/client";
export default async function Page() {
  const { memoInitInPublic } = await fetch.initMemoInPublic();
  return memoInitInPublic;
}
`,
};

const graphOf = () => {
  const index = new AkanIndex({ ts, root });
  for (const [rel, text] of Object.entries(files)) index.setFile(`${root}/${rel}`, text);
  return index.graph((fileName) => files[fileName.slice(root.length + 1)]);
};

const edgesOf = (graph: ReturnType<typeof graphOf>, kind?: string) =>
  graph.edges
    .filter((edge) => !kind || edge.kind === kind)
    .map((edge) => `${edge.from} -${edge.label ?? ""}-> ${edge.to}`)
    .sort();

describe("AkanIndex.graph", () => {
  it("draws a model's fields across its via chain and links each type it names", () => {
    const graph = graphOf();
    const memo = graph.nodes.find((node) => node.id === "model:apps/demo:memo");
    expect(
      memo?.fields?.map(({ name, type, array, optional, ref, declaredIn }) => [
        name,
        type,
        array,
        optional,
        ref,
        declaredIn,
      ]),
    ).toEqual([
      ["name", "String", false, false, null, "MemoInput"],
      ["images", "File", true, false, "model:libs/shared:file", "MemoInput"],
      ["place", "Geo", false, true, "scalar:libs/shared:geo", "MemoInput"],
      ["status", "MemoStatus", false, false, "enum:apps/demo:MemoStatus", "MemoObject"],
    ]);
    expect(graph.nodes.find((node) => node.id === "enum:apps/demo:MemoStatus")?.values).toEqual(["draft", "shared"]);
    expect(edgesOf(graph, "field")).toEqual([
      "model:apps/demo:memo -images[]-> model:libs/shared:file",
      "model:apps/demo:memo -place-> scalar:libs/shared:geo",
      "model:apps/demo:memo -status-> enum:apps/demo:MemoStatus",
    ]);
    expect(memo?.at).toEqual({ file: "apps/demo/lib/memo/memo.constant.ts", line: 14, column: 14 });
  });

  it("follows a request from the page through the slice, guard and service to the query", () => {
    const graph = graphOf();
    expect(edgesOf(graph, "guard")).toEqual([
      "endpoint:apps/demo:memo.shareMemo --> guard::Owner",
      "slice:apps/demo:memo -get-> guard::Public",
      "slice:apps/demo:memo -root-> guard::Admin",
      "slice:apps/demo:memo.inPublic --> guard::Public",
    ]);
    expect(edgesOf(graph, "calls")).toEqual([
      "action:apps/demo:memo.shareMemo -refreshAll-> action:apps/demo:memo.refreshAll",
      "action:apps/demo:memo.shareMemo -setMemo-> model:apps/demo:memo",
      "endpoint:apps/demo:memo.shareMemo -share-> method:apps/demo:memo.share",
      "method:apps/demo:memo.share -getMemo-> model:apps/demo:memo",
      "method:apps/demo:memo.share -touch-> method:apps/demo:memo.touch",
      "method:apps/demo:memo.touch -listByName-> query:apps/demo:memo.byName",
      "slice:apps/demo:memo.inPublic -queryByName-> query:apps/demo:memo.byName",
    ]);
    expect(edgesOf(graph, "fetches")).toEqual([
      "action:apps/demo:memo.shareMemo -shareMemo-> endpoint:apps/demo:memo.shareMemo",
    ]);
  });

  it("names the component or page that uses a slice, an action or a form setter", () => {
    const graph = graphOf();
    expect(edgesOf(graph, "uses")).toEqual([
      "component:apps/demo/lib/memo/Memo.Util.tsx#Rename -setNameOnMemo-> model:apps/demo:memo",
      "component:apps/demo/lib/memo/Memo.Util.tsx#Share -shareMemo-> action:apps/demo:memo.shareMemo",
      "route:apps/demo:/memo -initMemoInPublic-> slice:apps/demo:memo.inPublic",
    ]);
    const components = graph.nodes.filter((node) => node.kind === "component");
    expect(components.map(({ label, detail }) => [label, detail])).toEqual([
      ["Memo.Util.Rename", []],
      ["Memo.Util.Share", []],
    ]);
  });

  it("files a component under lib/_<service>/ in the <service> module", () => {
    const index = new AkanIndex({ ts, root });
    const withService: Record<string, string> = {
      ...files,
      "apps/demo/lib/_auth/Auth.Zone.tsx": `import { st } from "@apps/demo/client";
export const Login = () => st.do.shareMemo();
`,
    };
    for (const [rel, text] of Object.entries(withService)) index.setFile(`${root}/${rel}`, text);
    const graph = index.graph((fileName) => withService[fileName.slice(root.length + 1)]);
    const zone = graph.nodes.find((node) => node.kind === "component" && node.label === "Auth.Zone.Login");
    expect(zone?.module).toBe("auth");
    expect(graph.nodes.find((node) => node.label === "Memo.Util.Share")?.module).toBe("memo");
  });

  it("links an app module that extends a lib module to the app's own node", () => {
    const index = new AkanIndex({ ts, root });
    const extended: Record<string, string> = {
      ...files,
      "libs/shared/lib/memo/memo.constant.ts": `import { via } from "akanjs/constant";
export class Memo extends via((field) => ({ title: field(String) })) {}
`,
      "libs/shared/lib/memo/memo.service.ts": `import { serve } from "akanjs/service";
import * as db from "../db";
export class MemoService extends serve(db.memo, () => ({})) {}
`,
    };
    for (const [rel, text] of Object.entries(extended)) index.setFile(`${root}/${rel}`, text);
    const graph = index.graph((fileName) => extended[fileName.slice(root.length + 1)]);
    expect(graph.nodes.some((node) => node.id === "model:libs/shared:memo")).toBe(true);
    expect(edgesOf(graph).filter((edge) => edge.includes("model:libs/shared:memo"))).toEqual([]);
  });

  it("keys each guard by the owner that declares it, through the import that names it", () => {
    const index = new AkanIndex({ ts, root });
    const guarded: Record<string, string> = {
      ...files,
      "libs/shared/srvkit/guards.ts": `import type { Guard, GuardScope, SignalContext } from "akanjs/signal";

//? Every guard keeps \`static name\`.

// Without it, anyone runs console operations.
export class Admin implements Guard {
  static name = "Admin";
  static scope: GuardScope = "account";
  canPass(context: SignalContext) {
    return !!context;
  }
}
`,
      "libs/shared/srvkit/sso.ts": `import type { Guard, GuardScope } from "akanjs/signal";

// Without it, a sign-in starts against a provider with no credentials.
const ssoGuardOf = (type: string, name: string) =>
  class implements Guard {
    static name = name;
    static scope: GuardScope = "account";
    canPass() {
      return !!type;
    }
  };

export const SSOKakao = ssoGuardOf("kakao", "SSOKakao");
`,
      "libs/shared/srvkit/ssoMap.ts": `import { SSOKakao } from "./sso";
export const SSO = { Kakao: SSOKakao } as const;
`,
      "libs/billing/srvkit/guards.ts": `import type { Guard } from "akanjs/signal";
export class Admin implements Guard {
  static name = "Admin";
  canPass() {
    return true;
  }
}
`,
      "apps/demo/srvkit/guards.ts": `import type { Guard, GuardScope } from "akanjs/signal";
/**
 * The caller wrote the memo.
 */
export class Owner implements Guard {
  static name = "Owner";
  static scope: GuardScope = "resource";
  canPass() {
    return true;
  }
}
`,
      "apps/demo/srvkit/guards.test.ts": `import type { Guard } from "akanjs/signal";
export class Fake implements Guard {
  canPass() {
    return true;
  }
}
`,
      "apps/demo/lib/memo/memo.signal.ts": `import { Admin as AdminGuard, SSO } from "@libs/shared/srvkit";
import * as srvkit from "@libs/shared/srvkit";
import { endpoint, Public, slice } from "akanjs/signal";
import { Owner } from "../../srvkit/guards";
import * as srv from "../srv";
export class MemoSlice extends slice(srv.memo, { guards: { root: AdminGuard, get: Public, cru: [Owner, None] } }, (init) => ({
  inPublic: init({ guards: [Public] }).exec(function () {
    return this.memoService.queryByName("");
  }),
})) {}
export class MemoEndpoint extends endpoint(srv.memo, ({ mutation }) => ({
  shareMemo: mutation(cnst.Memo, { guards: [Owner, SSO.Kakao] }).exec(async function (id) {
    return await this.memoService.share(id);
  }),
  pinMemo: mutation(cnst.Memo, { guards: [srvkit.Admin] }).exec(async function (id) {
    return await this.memoService.share(id);
  }),
})) {}
`,
    };
    for (const [rel, text] of Object.entries(guarded)) index.setFile(`${root}/${rel}`, text);
    const graph = index.graph((fileName) => guarded[fileName.slice(root.length + 1)], { digests: true });
    expect(edgesOf(graph, "guard")).toEqual([
      "endpoint:apps/demo:memo.pinMemo --> guard:libs/shared:Admin",
      "endpoint:apps/demo:memo.shareMemo --> guard:apps/demo:Owner",
      "endpoint:apps/demo:memo.shareMemo --> guard:libs/shared:SSOKakao",
      "slice:apps/demo:memo -cru-> guard::None",
      "slice:apps/demo:memo -cru-> guard:apps/demo:Owner",
      "slice:apps/demo:memo -get-> guard::Public",
      "slice:apps/demo:memo -root-> guard:libs/shared:Admin",
      "slice:apps/demo:memo.inPublic --> guard::Public",
    ]);
    const guards = graph.nodes.filter((node) => node.kind === "guard");
    expect(guards.map(({ id, detail, at, doc }) => [id, detail, at && `${at.file}:${at.line}`, doc ?? null])).toEqual([
      ["guard::None", ["account", "akanjs"], null, "Refuses every caller."],
      ["guard::Public", ["account", "akanjs"], null, "Passes every caller, signed in or not."],
      ["guard:apps/demo:Owner", ["resource"], "apps/demo/srvkit/guards.ts:5", "The caller wrote the memo."],
      ["guard:libs/billing:Admin", [], "libs/billing/srvkit/guards.ts:2", null],
      [
        "guard:libs/shared:Admin",
        ["account"],
        "libs/shared/srvkit/guards.ts:6",
        "Without it, anyone runs console operations.",
      ],
      [
        "guard:libs/shared:SSOKakao",
        ["account"],
        "libs/shared/srvkit/sso.ts:13",
        "Without it, a sign-in starts against a provider with no credentials.",
      ],
    ]);
    expect(guards.every((node) => node.at === null || /^[0-9a-f]{8}$/.test(node.digest ?? ""))).toBe(true);
  });

  it("follows a lib's re-export to the guard it names, and `export *` only when it reaches one workspace candidate", () => {
    const admin = `import type { Guard } from "akanjs/signal";
export class Admin implements Guard {
  canPass() {
    return true;
  }
}
`;
    const graphOf = (reexport: string, extra: Record<string, string> = {}) => {
      const given: Record<string, string> = {
        ...extra,
        "libs/billing/srvkit/admin.ts": admin,
        "libs/util/srvkit/admin.ts": admin,
        "libs/shared/srvkit/index.ts": reexport,
        "apps/demo/lib/memo/memo.signal.ts": `import { Admin } from "@libs/shared/srvkit";
import { endpoint } from "akanjs/signal";
import * as srv from "../srv";
export class MemoEndpoint extends endpoint(srv.memo, ({ mutation }) => ({
  shareMemo: mutation(cnst.Memo, { guards: [Admin] }).exec(async function () {
    return null;
  }),
})) {}
`,
      };
      const index = new AkanIndex({ ts, root });
      for (const [rel, text] of Object.entries(given)) index.setFile(`${root}/${rel}`, text);
      return index.graph((fileName) => given[fileName.slice(root.length + 1)], { digests: true });
    };
    const named = graphOf(`export { Admin } from "@libs/util/srvkit";\n`);
    expect(named.edges.filter((edge) => edge.kind === "guard").map((edge) => edge.to)).toEqual([
      "guard:libs/util:Admin",
    ]);
    const guardsOf = (graph: ReturnType<typeof graphOf>) =>
      graph.edges.filter((edge) => edge.kind === "guard").map((edge) => edge.to);
    const starred = `export * from "@libs/util/srvkit";\n`;
    expect(guardsOf(graphOf(starred))).toEqual(["guard:libs/util:Admin"]);
    expect(guardsOf(graphOf(starred, { "libs/shared/ui/index.ts": `export * from "@vendor/ui";\n` }))).toEqual([
      "guard:libs/util:Admin",
    ]);
    for (const ambiguous of [
      `${starred}export * from "@libs/billing/srvkit";\n`,
      `export * from "@vendor/admin";\n`,
      `${starred}export * from "@vendor/admin";\n`,
      `${starred}export const Admin = "admin";\n`,
      `${starred}import Admin from "@vendor/auth";\nexport { Admin };\n`,
      `${starred}export const { Admin } = makeGuards();\n`,
    ]) {
      const graph = graphOf(ambiguous);
      expect(guardsOf(graph)).toEqual(["guard:libs/shared:Admin"]);
      expect(graph.nodes.find((node) => node.id === "guard:libs/shared:Admin")?.at).toBeNull();
    }
  });

  it("follows a guard through a map's own imports, a re-export, and a factory a file imports or wraps", () => {
    const guarded = (resourceBody: string, pinField: string): Record<string, string> => ({
      "libs/util/srvkit/guards.ts": `import type { Guard, GuardScope } from "akanjs/signal";
export class Admin implements Guard {
  static scope: GuardScope = "account";
  canPass() {
    return true;
  }
}
`,
      "libs/shared/srvkit/admin.ts": `export { Admin } from "@libs/util/srvkit";
`,
      "libs/shared/srvkit/resource.ts": `import type { Guard as SignalGuard } from "akanjs/signal";
export const resourceGuard = (field: string) =>
  class implements SignalGuard {
    static scope = "resource" as const;
    canPass() {
      return ${resourceBody};
    }
  };
/** Passes the caller who created it, through {@link resourceGuard}. */
export const createdBySelf = (field: string) => resourceGuard(field);
export const OwnsPin = createdBySelf("${pinField}");
`,
      "libs/shared/srvkit/sso.ts": `import type { Guard, GuardScope } from "akanjs/signal";
const ssoGuardOf = (type: string) =>
  class implements Guard {
    static scope: GuardScope = "account";
    canPass() {
      return !!type;
    }
  };
export const SSOKakao = ssoGuardOf("kakao");
`,
      "libs/shared/srvkit/config.ts": `const kakaoConfig = { id: "" };
const SSO = { Kakao: kakaoConfig };
`,
      "libs/shared/srvkit/ssoMap.ts": `import { SSOKakao as Kakao } from "./sso";
export const SSO = { Kakao };
`,
      "libs/shared/srvkit/guards.spec.ts": `import type { Guard } from "akanjs/signal";
export class Fake implements Guard {
  canPass() {
    return true;
  }
}
`,
      "apps/demo/srvkit/guards.ts": `import { resourceGuard } from "@libs/shared/srvkit";
/** The caller is a member of the project. */
export const ProjectMember = resourceGuard("project");
export const CanCreatePin = resourceGuard("pin");
`,
      "apps/demo/lib/memo/memo.signal.ts": `import { Admin, OwnsPin, SSO } from "@libs/shared/srvkit";
import { endpoint } from "akanjs/signal";
import { CanCreatePin, ProjectMember } from "../../srvkit/guards";
import * as srv from "../srv";
export class MemoEndpoint extends endpoint(srv.memo, ({ mutation }) => ({
  shareMemo: mutation(cnst.Memo, { guards: [Admin, SSO.Kakao, OwnsPin, ProjectMember, CanCreatePin] }).exec(
    async function (id) {
      return await this.memoService.share(id);
    },
  ),
})) {}
`,
    });
    const graphOf = (given: Record<string, string>) => {
      const index = new AkanIndex({ ts, root });
      for (const [rel, text] of Object.entries(given)) index.setFile(`${root}/${rel}`, text);
      return index.graph((fileName) => given[fileName.slice(root.length + 1)], { digests: true });
    };
    const graph = graphOf(guarded("!!field", "pin"));
    expect(edgesOf(graph, "guard")).toEqual([
      "endpoint:apps/demo:memo.shareMemo --> guard:apps/demo:CanCreatePin",
      "endpoint:apps/demo:memo.shareMemo --> guard:apps/demo:ProjectMember",
      "endpoint:apps/demo:memo.shareMemo --> guard:libs/shared:OwnsPin",
      "endpoint:apps/demo:memo.shareMemo --> guard:libs/shared:SSOKakao",
      "endpoint:apps/demo:memo.shareMemo --> guard:libs/util:Admin",
    ]);
    const guards = graph.nodes.filter((node) => node.kind === "guard");
    expect(guards.map(({ id, detail, at, doc }) => [id, detail, at && `${at.file}:${at.line}`, doc ?? null])).toEqual([
      ["guard:apps/demo:CanCreatePin", ["resource"], "apps/demo/srvkit/guards.ts:4", null],
      [
        "guard:apps/demo:ProjectMember",
        ["resource"],
        "apps/demo/srvkit/guards.ts:3",
        "The caller is a member of the project.",
      ],
      [
        "guard:libs/shared:OwnsPin",
        ["resource"],
        "libs/shared/srvkit/resource.ts:11",
        "Passes the caller who created it, through resourceGuard.",
      ],
      ["guard:libs/shared:SSOKakao", ["account"], "libs/shared/srvkit/sso.ts:9", null],
      ["guard:libs/util:Admin", ["account"], "libs/util/srvkit/guards.ts:2", null],
    ]);
    const changedOf = (resourceBody: string, pinField: string) =>
      AkanGraphDiff.between(graph, graphOf(guarded(resourceBody, pinField)))
        .nodes.filter((node) => node.kind === "guard" && node.change === "changed")
        .map((node) => node.id);
    expect(changedOf("!!field", "board")).toEqual(["guard:libs/shared:OwnsPin"]);
    expect(changedOf("field.length > 0", "pin")).toEqual([
      "guard:apps/demo:CanCreatePin",
      "guard:apps/demo:ProjectMember",
      "guard:libs/shared:OwnsPin",
    ]);
  });

  it("takes a function as a factory only when it returns a guard, and an import from a package or akanjs as none", () => {
    const given: Record<string, string> = {
      "libs/shared/srvkit/resource.ts": `import type { Guard } from "akanjs/signal";
export const resourceGuard = (field: string) =>
  class implements Guard {
    canPass() {
      return !!field;
    }
  };
export class Admin implements Guard {
  canPass() {
    return true;
  }
}
export const countGuards = () => [Admin, resourceGuard("a")].length;
export const guardCount = countGuards();
`,
      "libs/util/srvkit/made.ts": `import { resourceGuard as fromAkan } from "akanjs/signal";
import { resourceGuard } from "@vendor/auth";
export const VendorMade = resourceGuard("vendor");
export const AkanMade = fromAkan("akan");
`,
      "apps/demo/srvkit/guards.ts": `import type { Guard } from "akanjs/signal";
export class Owner implements Guard {
  canPass() {
    return true;
  }
}
`,
      "apps/demo/lib/memo/memo.signal.ts": `import { Owner, Public } from "@vendor/auth";
import { endpoint } from "akanjs/signal";
import * as srv from "../srv";
export class MemoEndpoint extends endpoint(srv.memo, ({ mutation }) => ({
  shareMemo: mutation(cnst.Memo, { guards: [Owner, Public] }).exec(async function () {
    return null;
  }),
})) {}
`,
    };
    const index = new AkanIndex({ ts, root });
    for (const [rel, text] of Object.entries(given)) index.setFile(`${root}/${rel}`, text);
    const graph = index.graph((fileName) => given[fileName.slice(root.length + 1)]);
    expect(graph.nodes.filter((node) => node.kind === "guard").map((node) => node.id)).toEqual([
      "guard:apps/demo:Owner",
      "guard:libs/shared:Admin",
    ]);
    expect(edgesOf(graph, "guard")).toEqual([]);
    expect(graph.nodes.find((node) => node.id === "endpoint:apps/demo:memo.shareMemo")?.detail).toEqual([
      "mutation",
      "Owner",
      "Public",
    ]);
  });

  it("locates a guard behind a renamed or akanjs re-export, a namespace's map, a wrapper, a subclass or a call in place", () => {
    const guarded = (ownerBody: string): Record<string, string> => ({
      "libs/util/srvkit/guards.ts": `import type { Guard, GuardScope } from "akanjs/signal";
export class Admin implements Guard {
  static scope: GuardScope = "account";
  canPass() {
    return true;
  }
}
export const resourceGuard = (field: string) =>
  class implements Guard {
    static scope = "resource" as const;
    canPass() {
      return !!field;
    }
  };
export const ownerGuard = () =>
  class implements Guard {
    static scope = "resource" as const;
    canPass() {
      return ${ownerBody};
    }
  };
`,
      "libs/shared/srvkit/reexports.ts": `export { Admin as AdminGuard } from "@libs/util/srvkit";
export { Public } from "akanjs/signal";
`,
      "libs/shared/srvkit/sso.ts": `import { resourceGuard } from "@libs/util/srvkit";
export const SSO = {
  // Signs in through Kakao.
  Kakao: resourceGuard("kakao"),
};
`,
      "apps/demo/srvkit/guards.ts": `import { Admin, ownerGuard, resourceGuard } from "@libs/util/srvkit";
import * as utilkit from "@libs/util/srvkit";
/** The caller belongs to the project, or owns it. */
const memberOf = (field: string) => (field ? resourceGuard(field) : ownerGuard());
export const ProjectMember = memberOf("project");
export const PinOwner = utilkit.resourceGuard("pin");
// Admins of the demo app only.
export class DemoAdmin extends Admin {}
`,
      "apps/demo/lib/memo/memo.signal.ts": `import { AdminGuard, Public } from "@libs/shared/srvkit";
import * as srvkit from "@libs/shared/srvkit";
import { resourceGuard } from "@libs/util/srvkit";
import { endpoint } from "akanjs/signal";
import { DemoAdmin, PinOwner, ProjectMember } from "../../srvkit/guards";
import * as srv from "../srv";
export class MemoEndpoint extends endpoint(srv.memo, ({ mutation }) => ({
  shareMemo: mutation(cnst.Memo, {
    guards: [AdminGuard, Public, srvkit.SSO.Kakao, ProjectMember, PinOwner, DemoAdmin, resourceGuard("memo")],
  }).exec(async function () {
    return null;
  }),
})) {}
`,
    });
    const graphOf = (given: Record<string, string>) => {
      const index = new AkanIndex({ ts, root });
      for (const [rel, text] of Object.entries(given)) index.setFile(`${root}/${rel}`, text);
      return index.graph((fileName) => given[fileName.slice(root.length + 1)], { digests: true });
    };
    const graph = graphOf(guarded("true"));
    const inPlace = "guard:apps/demo:lib/memo/memo.signal.ts#memo.shareMemo:resourceGuard@1";
    expect(edgesOf(graph, "guard")).toEqual([
      "endpoint:apps/demo:memo.shareMemo --> guard::Public",
      "endpoint:apps/demo:memo.shareMemo --> guard:apps/demo:DemoAdmin",
      "endpoint:apps/demo:memo.shareMemo --> guard:apps/demo:PinOwner",
      "endpoint:apps/demo:memo.shareMemo --> guard:apps/demo:ProjectMember",
      `endpoint:apps/demo:memo.shareMemo --> ${inPlace}`,
      "endpoint:apps/demo:memo.shareMemo --> guard:libs/shared:SSO.Kakao",
      "endpoint:apps/demo:memo.shareMemo --> guard:libs/util:Admin",
    ]);
    expect(graph.nodes.find((node) => node.id === "endpoint:apps/demo:memo.shareMemo")?.detail).toEqual([
      "mutation",
      "AdminGuard",
      "Public",
      "srvkit.SSO.Kakao",
      "ProjectMember",
      "PinOwner",
      "DemoAdmin",
      'resourceGuard("memo")',
    ]);
    const guards = graph.nodes.filter((node) => node.kind === "guard" && node.at);
    expect(
      guards.map(({ id, detail, at, doc, sources }) => [
        id,
        detail,
        `${at?.file}:${at?.line}`,
        doc ?? null,
        sources ?? [],
      ]),
    ).toEqual([
      [
        "guard:apps/demo:DemoAdmin",
        ["account"],
        "apps/demo/srvkit/guards.ts:8",
        "Admins of the demo app only.",
        ["libs/util/srvkit/guards.ts"],
      ],
      ["guard:apps/demo:PinOwner", ["resource"], "apps/demo/srvkit/guards.ts:6", null, ["libs/util/srvkit/guards.ts"]],
      [
        "guard:apps/demo:ProjectMember",
        ["resource"],
        "apps/demo/srvkit/guards.ts:5",
        "The caller belongs to the project, or owns it.",
        ["libs/util/srvkit/guards.ts"],
      ],
      [inPlace, ["resource"], "apps/demo/lib/memo/memo.signal.ts:9", null, ["libs/util/srvkit/guards.ts"]],
      [
        "guard:libs/shared:SSO.Kakao",
        ["resource"],
        "libs/shared/srvkit/sso.ts:4",
        "Signs in through Kakao.",
        ["libs/util/srvkit/guards.ts"],
      ],
      ["guard:libs/util:Admin", ["account"], "libs/util/srvkit/guards.ts:2", null, []],
    ]);
    const changed = AkanGraphDiff.between(graph, graphOf(guarded("false")))
      .nodes.filter((node) => node.kind === "guard" && node.change === "changed")
      .map((node) => node.id);
    expect(changed).toEqual(["guard:apps/demo:ProjectMember"]);
  });

  it("names a guard made in place by member, callee and ordinal, takes a class handed to a wrapper, and skips a plain base", () => {
    const made = (check: string, sibling = ""): Record<string, string> => ({
      "libs/util/srvkit/guards.ts": `import type { Guard } from "akanjs/signal";
const withName = <T>(guard: T, name: string) => Object.assign(guard as object, { guardName: name }) as T;
export const resourceGuard = (field: string) =>
  withName(
    class implements Guard {
      static scope = "resource" as const;
      canPass() {
        return !!field;
      }
    },
    field,
  );
export { resourceGuard as rg };
export const allow = (check: (user: unknown) => boolean) =>
  class implements Guard {
    canPass() {
      return check(null);
    }
  };
`,
      "libs/util/common/base.ts": `export class Base {}
`,
      "libs/shared/srvkit/base.ts": `import type { Guard } from "akanjs/signal";
export class Base implements Guard {
  canPass() {
    return true;
  }
}
`,
      "apps/demo/srvkit/guards.ts": `import { Base } from "@libs/util/common";
import { rg } from "@libs/util/srvkit";
export const Pin = rg("pin");
export class Thing extends Base {}
`,
      "apps/demo/srvkit/local.ts": `class Base {}
export class Local extends Base {}
`,
      "apps/demo/lib/memo/memo.signal.ts": `import { allow, resourceGuard } from "@libs/util/srvkit";
import { endpoint } from "akanjs/signal";
import { Pin } from "../../srvkit/guards";
import * as srv from "../srv";
export class MemoEndpoint extends endpoint(srv.memo, ({ mutation }) => ({${sibling}
  shareMemo: mutation(cnst.Memo, {
    guards: [
      Pin,
      resourceGuard("memo"),
      allow((user) => !!user),
      allow((user) => {
        return ${check};
      }),
    ],
  }).exec(async function () {
    return null;
  }),
})) {}
`,
    });
    const graphOf = (given: Record<string, string>) => {
      const index = new AkanIndex({ ts, root });
      for (const [rel, text] of Object.entries(given)) index.setFile(`${root}/${rel}`, text);
      return index.graph((fileName) => given[fileName.slice(root.length + 1)], { digests: true });
    };
    const graph = graphOf(made("!!user"));
    const inPlace = "guard:apps/demo:lib/memo/memo.signal.ts#memo.shareMemo:";
    expect(edgesOf(graph, "guard")).toEqual([
      "endpoint:apps/demo:memo.shareMemo --> guard:apps/demo:Pin",
      `endpoint:apps/demo:memo.shareMemo --> ${inPlace}allow@1`,
      `endpoint:apps/demo:memo.shareMemo --> ${inPlace}allow@2`,
      `endpoint:apps/demo:memo.shareMemo --> ${inPlace}resourceGuard@1`,
    ]);
    expect(graph.nodes.find((node) => node.id === "endpoint:apps/demo:memo.shareMemo")?.detail).toEqual([
      "mutation",
      "Pin",
      'resourceGuard("memo")',
      "allow((user) => !!user)",
      "allow(…)",
    ]);
    expect(
      graph.nodes
        .filter((node) => node.kind === "guard")
        .map(({ id, label, detail, at }) => [id, label, detail, at && `${at.file}:${at.line}`]),
    ).toEqual([
      ["guard:apps/demo:Pin", "Pin", ["resource"], "apps/demo/srvkit/guards.ts:3"],
      [`${inPlace}allow@1`, "allow((user) => !!user)", [], "apps/demo/lib/memo/memo.signal.ts:10"],
      [`${inPlace}allow@2`, "allow(…)", [], "apps/demo/lib/memo/memo.signal.ts:11"],
      [`${inPlace}resourceGuard@1`, 'resourceGuard("memo")', ["resource"], "apps/demo/lib/memo/memo.signal.ts:9"],
      ["guard:libs/shared:Base", "Base", [], "libs/shared/srvkit/base.ts:2"],
    ]);
    const changed = AkanGraphDiff.between(graph, graphOf(made("user !== null")))
      .nodes.filter((node) => node.change)
      .map(({ id, change }) => `${change} ${id}`);
    expect(changed).toEqual(["changed endpoint:apps/demo:memo.shareMemo", `changed ${inPlace}allow@2`]);
    const sibling = `
  zeta: mutation(cnst.Memo, { guards: [resourceGuard("zeta")] }).exec(async function () {
    return null;
  }),`;
    const changesOf = (before: ReturnType<typeof graphOf>, after: ReturnType<typeof graphOf>) => {
      const changes = AkanGraphDiff.between(before, after);
      return [
        ...changes.nodes.filter((node) => node.change).map(({ id, change }) => `${change} ${id}`),
        ...changes.edges.filter((edge) => edge.change).map(({ from, to, change }) => `${change} ${from} --> ${to}`),
      ];
    };
    const zeta = "guard:apps/demo:lib/memo/memo.signal.ts#memo.zeta:resourceGuard@1";
    const withSibling = graphOf(made("!!user", sibling));
    expect(changesOf(graph, withSibling)).toEqual([
      "added endpoint:apps/demo:memo.zeta",
      `added ${zeta}`,
      `added endpoint:apps/demo:memo.zeta --> ${zeta}`,
    ]);
    expect(changesOf(withSibling, graph)).toEqual([
      "removed endpoint:apps/demo:memo.zeta",
      `removed ${zeta}`,
      `removed endpoint:apps/demo:memo.zeta --> ${zeta}`,
    ]);
  });

  it("keys a name two files of one owner declare by file, and follows each import to its own", () => {
    const admin = (doc: string) => `import type { Guard } from "akanjs/signal";
// ${doc}
export class Admin implements Guard {
  canPass() {
    return true;
  }
}
`;
    const given: Record<string, string> = {
      "apps/demo/srvkit/admin.ts": admin("Runs the console."),
      "apps/demo/lib/_auth/admin.ts": admin("Runs sign-in."),
      "apps/demo/lib/memo/memo.signal.ts": `import { endpoint } from "akanjs/signal";
import { Admin } from "../../srvkit/admin";
import * as srv from "../srv";
export class MemoEndpoint extends endpoint(srv.memo, ({ mutation }) => ({
  shareMemo: mutation(cnst.Memo, { guards: [Admin] }).exec(async function () {
    return null;
  }),
})) {}
`,
      "apps/demo/lib/user/user.signal.ts": `import { endpoint } from "akanjs/signal";
import { Admin } from "../_auth/admin";
import * as srv from "../srv";
export class UserEndpoint extends endpoint(srv.user, ({ mutation }) => ({
  signIn: mutation(cnst.User, { guards: [Admin] }).exec(async function () {
    return null;
  }),
})) {}
`,
    };
    const graphOf = (files: Record<string, string>) => {
      const index = new AkanIndex({ ts, root });
      for (const [rel, text] of Object.entries(files)) index.setFile(`${root}/${rel}`, text);
      return index.graph((fileName) => files[fileName.slice(root.length + 1)], { digests: true });
    };
    const graph = graphOf(given);
    expect(edgesOf(graph, "guard")).toEqual([
      "endpoint:apps/demo:memo.shareMemo --> guard:apps/demo:srvkit/admin.ts#Admin",
      "endpoint:apps/demo:user.signIn --> guard:apps/demo:lib/_auth/admin.ts#Admin",
    ]);
    const single = graphOf(
      Object.fromEntries(Object.entries(given).filter(([rel]) => !/_auth\/admin|user\.signal/.test(rel))),
    );
    const guardChangesOf = (changes: ReturnType<typeof AkanGraphDiff.between>) => [
      ...changes.nodes
        .filter((node) => node.kind === "guard" && node.change)
        .map(({ id, change }) => `${change} ${id}`),
      ...changes.edges
        .filter((edge) => edge.kind === "guard" && edge.change)
        .map(({ from, to, change }) => `${change} ${from} --> ${to}`),
    ];
    expect(guardChangesOf(AkanGraphDiff.between(single, graph))).toEqual([
      "added guard:apps/demo:lib/_auth/admin.ts#Admin",
      "added endpoint:apps/demo:user.signIn --> guard:apps/demo:lib/_auth/admin.ts#Admin",
    ]);
    expect(guardChangesOf(AkanGraphDiff.between(graph, single))).toEqual([
      "removed guard:apps/demo:lib/_auth/admin.ts#Admin",
      "removed endpoint:apps/demo:user.signIn --> guard:apps/demo:lib/_auth/admin.ts#Admin",
    ]);
    expect(
      graph.nodes.filter((node) => node.kind === "guard").map(({ at, doc }) => [`${at?.file}:${at?.line}`, doc]),
    ).toEqual([
      ["apps/demo/lib/_auth/admin.ts:3", "Runs sign-in."],
      ["apps/demo/srvkit/admin.ts:3", "Runs the console."],
    ]);
  });

  it("drops a file's guards once it no longer declares one", () => {
    const index = new AkanIndex({ ts, root });
    const guardFile = "libs/shared/srvkit/guards.ts";
    const declared = `import type { Guard } from "akanjs/signal";
export class Admin implements Guard {
  canPass() {
    return true;
  }
}
`;
    index.setFile(`${root}/${guardFile}`, declared);
    expect(index.graph(() => declared).nodes.map((node) => node.id)).toEqual(["guard:libs/shared:Admin"]);
    index.setFile(`${root}/${guardFile}`, "export const admin = 1;\n");
    expect(index.graph(() => "export const admin = 1;\n").nodes).toEqual([]);
  });

  it("maps page/ to routes and layouts, which layout wraps which, and the guards that gate them", () => {
    const index = new AkanIndex({ ts, root });
    const paged: Record<string, string> = {
      "libs/shared/webkit/signedIn.ts": `import { getSelf } from "./cookie";

// Sends a guest to the sign-in page.
export const signedIn = (unauthorize = "/signin") => {
  getSelf({ unauthorize });
};
`,
      "apps/demo/page/_layout.tsx": `import { rootLayout } from "akanjs/client";
export default rootLayout().render(({ children }) => children);
`,
      "apps/demo/page/_index.tsx": `import { page } from "akanjs/client";
export default page().render(() => null);
`,
      "apps/demo/page/_overrides.tsx": `export default override({});
`,
      "apps/demo/page/(app)/_layout.tsx": `import { signedIn } from "@libs/shared/webkit";
import { layout } from "akanjs/client";
export default layout()
  .guard(() => {
    signedIn();
    String(1);
  })
  .render(({ children }) => children);
`,
      "apps/demo/page/(app)/memo/[memoId].tsx": `import { fetch } from "@apps/demo/client";
import { page } from "akanjs/client";
import { ID } from "akanjs/base";
const isOwn = (memoId: string) => !!memoId;
const isId = (memoId: string) => memoId;
export default page()
  .param("memoId", ID)
  .guard(({ memoId }) => {
    Boolean(isOwn(isId(memoId)));
  })
  .render(({ memoId }) => fetch.memo(memoId));
`,
      "apps/demo/lib/memo/memo.store.ts": files["apps/demo/lib/memo/memo.store.ts"],
      "libs/shared/common/signedIn.ts": `export const signedIn = () => false;
`,
      "apps/demo/page/(app)/pin.tsx": `import { st } from "@apps/demo/client";
import { page, redirect } from "akanjs/client";
// Pins are the caller's own.
const isOwn = () => true;
export default page()
  .guard(() => isOwn() || redirect("/signin"))
  .render(() => st.do.shareMemo("x"));
`,
      "apps/demo/page/about.tsx": `import { st } from "@apps/demo/client";
const About = () => st.do.shareMemo("about");
export default About;
`,
      "apps/demo/page/docs.tsx": `const sample = \`
export default layout()
  .render(() => null)
\`;

export default page().render(() => sample);
`,
      "apps/demo/page/(libs)/consent.tsx": `export default page().render(() => null);
`,
      "libs/shared/page/oauth/consent/_index.tsx": `export default page().render(() => null);
`,
    };
    for (const [rel, text] of Object.entries(paged)) index.setFile(`${root}/${rel}`, text);
    const graph = index.graph((fileName) => paged[fileName.slice(root.length + 1)], { digests: true });
    const routes = graph.nodes.filter((node) => node.kind === "route" || node.kind === "layout");
    expect(
      routes.map(({ id, label, detail, at }) => [id, label, detail, at && `${at.file}:${at.line}:${at.column}`]),
    ).toEqual([
      ["layout:apps/demo:/", "/_layout", ["root"], "apps/demo/page/_layout.tsx:2:1"],
      ["layout:apps/demo:/(app)", "/(app)/_layout", ["guard"], "apps/demo/page/(app)/_layout.tsx:3:1"],
      ["route:apps/demo:/", "/", [], "apps/demo/page/_index.tsx:2:1"],
      ["route:apps/demo:/about", "/about", [], "apps/demo/page/about.tsx:3:1"],
      ["route:apps/demo:/docs", "/docs", [], "apps/demo/page/docs.tsx:6:1"],
      ["route:apps/demo:/memo/:memoId", "/memo/:memoId", ["guard"], "apps/demo/page/(app)/memo/[memoId].tsx:6:1"],
      ["route:apps/demo:/pin", "/pin", ["guard"], "apps/demo/page/(app)/pin.tsx:5:1"],
      ["route:libs/shared:/oauth/consent", "/oauth/consent", [], "libs/shared/page/oauth/consent/_index.tsx:1:1"],
    ]);
    expect(edgesOf(graph, "wraps")).toEqual([
      "layout:apps/demo:/ --> layout:apps/demo:/(app)",
      "layout:apps/demo:/ --> route:apps/demo:/",
      "layout:apps/demo:/ --> route:apps/demo:/about",
      "layout:apps/demo:/ --> route:apps/demo:/docs",
      "layout:apps/demo:/(app) --> route:apps/demo:/memo/:memoId",
      "layout:apps/demo:/(app) --> route:apps/demo:/pin",
    ]);
    expect(graph.edges.find((edge) => edge.kind === "wraps" && edge.to === "route:apps/demo:/pin")?.at).toEqual({
      file: "apps/demo/page/(app)/pin.tsx",
      line: 5,
      column: 1,
    });
    expect(edgesOf(graph, "uses")).toContain("route:apps/demo:/pin -shareMemo-> action:apps/demo:memo.shareMemo");
    expect(edgesOf(graph, "uses")).toContain("route:apps/demo:/about -shareMemo-> action:apps/demo:memo.shareMemo");
    expect(graph.nodes.some((node) => node.id.startsWith("component:apps/demo/page/"))).toBe(false);
    expect(edgesOf(graph, "guard")).toEqual([
      "layout:apps/demo:/(app) --> guard:libs/shared:webkit/signedIn.ts#signedIn",
      "route:apps/demo:/memo/:memoId --> guard:apps/demo:page/(app)/memo/[memoId].tsx#isOwn",
      "route:apps/demo:/pin --> guard:apps/demo:page/(app)/pin.tsx#isOwn",
    ]);
    expect(
      graph.nodes
        .filter((node) => node.kind === "guard" && node.name === "isOwn")
        .map(({ at, doc }) => [at && `${at.file}:${at.line}`, doc ?? null]),
    ).toEqual([
      ["apps/demo/page/(app)/memo/[memoId].tsx:4", null],
      ["apps/demo/page/(app)/pin.tsx:4", "Pins are the caller's own."],
    ]);
    const signedIn = graph.nodes.find((node) => node.id === "guard:libs/shared:webkit/signedIn.ts#signedIn");
    expect([signedIn?.detail, signedIn?.at?.line, signedIn?.doc]).toEqual([
      ["route"],
      4,
      "Sends a guest to the sign-in page.",
    ]);
    expect(routes.every((node) => /^[0-9a-f]{8}$/.test(node.digest ?? ""))).toBe(true);
  });

  it("keys an imported guard function by its file, through a namespace or a re-export, past a binding that shadows it", () => {
    const paged = (overload: string): Record<string, string> => ({
      "apps/demo/webkit/canEdit.ts": `// Checks the caller may edit in the browser.
export const canEdit = () => true;
`,
      "apps/demo/common/canEdit.ts": `// Checks the id names an editable record.
export function canEdit(id: string): boolean;
export function canEdit(id: ${overload}): boolean;
export function canEdit(id: unknown) {
  return !!id;
}
`,
      "libs/shared/webkit/auth.ts": `export const ready = true, signedIn = () => ready;
`,
      "libs/shared/webkit/session.ts": `export { signedIn as hasSession } from "./auth";
`,
      "apps/demo/client.ts": `export const { usePage } = makePageProto();
`,
      "apps/demo/page/a.tsx": `import { page } from "akanjs/client";
import { canEdit } from "../webkit/canEdit";
export default page()
  .guard(() => canEdit())
  .render(() => null);
`,
      "apps/demo/page/b.tsx": `import { page } from "akanjs/client";
import { canEdit } from "../common/canEdit";
export default page()
  .guard(() => canEdit("b"))
  .render(() => null);
`,
      "apps/demo/page/c.tsx": `import * as auth from "@libs/shared/webkit";
import { page } from "akanjs/client";
import { canEdit } from "../webkit/canEdit";
export default page()
  .guard(() => {
    const canEdit = () => false;
    auth.signedIn();
    canEdit();
  })
  .render(() => null);
`,
      "apps/demo/page/d.tsx": `import { usePage } from "@apps/demo/client";
import { hasSession } from "@libs/shared/webkit";
import { page } from "akanjs/client";
export default page()
  .guard(() => {
    usePage();
    hasSession();
  })
  .render(() => null);
`,
      "apps/demo/page/e.tsx": `import { page } from "akanjs/client";
import { canEdit } from "../webkit/canEdit";
export default page()
  .guard(() => [() => false].every((canEdit) => canEdit()) || canEdit())
  .render(() => null);
`,
      ...Object.fromEntries(
        [1, 2, 3].map((idx) => [
          `apps/demo/page/plain${idx}.tsx`,
          `import { usePage } from "@apps/demo/client";
import { page } from "akanjs/client";
export default page().render(() => {
  usePage();
  return null;
});
`,
        ]),
      ),
    });
    const parsed: string[] = [];
    const spied = {
      ...ts,
      createSourceFile: (...args: Parameters<typeof ts.createSourceFile>) => {
        parsed.push(args[0]);
        return ts.createSourceFile(...args);
      },
    };
    const graphOf = (given: Record<string, string>) => {
      const index = new AkanIndex({ ts: spied, root });
      for (const [rel, text] of Object.entries(given)) index.setFile(`${root}/${rel}`, text);
      parsed.length = 0;
      return index.graph((fileName) => given[fileName.slice(root.length + 1)], { digests: true });
    };
    const graph = graphOf(paged("number"));
    expect(parsed.filter((fileName) => fileName.includes("/page/plain"))).toEqual([]);
    expect(edgesOf(graph, "guard")).toEqual([
      "route:apps/demo:/a --> guard:apps/demo:webkit/canEdit.ts#canEdit",
      "route:apps/demo:/b --> guard:apps/demo:common/canEdit.ts#canEdit",
      "route:apps/demo:/c --> guard:libs/shared:webkit/auth.ts#signedIn",
      "route:apps/demo:/d --> guard:libs/shared:webkit/auth.ts#signedIn",
      "route:apps/demo:/e --> guard:apps/demo:webkit/canEdit.ts#canEdit",
    ]);
    expect(
      graph.nodes
        .filter((node) => node.kind === "guard")
        .map(({ id, at, doc }) => [id, `${at?.file}:${at?.line}`, doc ?? null]),
    ).toEqual([
      [
        "guard:apps/demo:common/canEdit.ts#canEdit",
        "apps/demo/common/canEdit.ts:2",
        "Checks the id names an editable record.",
      ],
      [
        "guard:apps/demo:webkit/canEdit.ts#canEdit",
        "apps/demo/webkit/canEdit.ts:2",
        "Checks the caller may edit in the browser.",
      ],
      ["guard:libs/shared:webkit/auth.ts#signedIn", "libs/shared/webkit/auth.ts:1", null],
    ]);
    const changed = AkanGraphDiff.between(graph, graphOf(paged("bigint")))
      .nodes.filter((node) => node.change)
      .map(({ id, change }) => `${change} ${id}`);
    expect(changed).toEqual(["changed guard:apps/demo:common/canEdit.ts#canEdit"]);
  });

  it("draws a module's jobs and the adaptors its service plugs, down to the adaptor a method calls", () => {
    const index = new AkanIndex({ ts, root });
    const wired: Record<string, string> = {
      "libs/util/srvkit/storageApi.ts": `import { adapt } from "akanjs/service";
export class BlobStorageApi extends adapt("blobStorageApi", () => ({})) {}

// Stores files on the object store, or on disk when none is configured.
export class StorageApi extends adapt("storageApi", ({ env, plug }) => ({
  options: env(() => null),
  blob: plug(BlobStorageApi),
})) {
  async deleteData(url: string) {
    return this.blob.getMemo(url);
  }
}
`,
      "apps/demo/plugin/mailer.ts": `import { adapt, dangerouslyAdapt } from "akanjs/service";
export class Clock extends adapt("clock") {}
export class Stripe extends adapt("stripe") {}
export class Mailer extends dangerouslyAdapt("mailer", ({ env }) => ({ host: env(() => "") })) {
  send() {
    return 1;
  }
}
`,
      "apps/demo/plugin/mailer.test.ts": `import { adapt } from "akanjs/service";
export class FakeMailer extends adapt("fakeMailer") {}
`,
      "apps/demo/srvkit/chatLlm.ts": `import { adapt } from "akanjs/service";
export class ChatLlm extends adapt("chatLlm") {}
`,
      "apps/demo/lib/option.ts": `import { AkanOption } from "akanjs/server";
import { LlmAdaptorRole } from "akanjs/service";
import { ChatLlm } from "../srvkit/chatLlm";
export const option = new AkanOption().applyAdaptor(LlmAdaptorRole, ChatLlm);
`,
      "libs/shared/srvkit/notifier.ts": `import { adapt } from "akanjs/service";
export class Notifier extends adapt("notifier") {}
`,
      "libs/util/srvkit/stripe.ts": `export { Stripe } from "stripe-sdk";
export { Client as Mailgun } from "@mailgun/sdk/server";
`,
      "libs/shared/srvkit/paypal.ts": `export { default as Paypal } from "paypal";
`,
      "libs/shared/srvkit/square.ts": `export * from "square-sdk";
`,
      "libs/social/lib/memo/memo.service.ts": `import { serve } from "akanjs/service";
import Paypal from "paypal";
import * as db from "../db";
export class MemoService extends serve(db.memo, ({ use, plug }) => ({
  notifier: use<{ ping: () => void }>(),
  payer: plug(Paypal),
})) {
  async ping() {
    return this.notifier.ping();
  }
  async pay() {
    return this.payer.charge();
  }
}
`,
      "libs/shared/lib/memo/memo.service.ts": `import { serve } from "akanjs/service";
import { Notifier } from "../../srvkit/notifier";
import * as db from "../db";
export class MemoService extends serve(db.memo, ({ plug }) => ({
  notifier: plug(Notifier),
})) {}
`,
      "apps/demo/lib/memo/memo.constant.ts": files["apps/demo/lib/memo/memo.constant.ts"],
      "apps/demo/lib/memo/memo.service.ts": `import * as srvkit from "@libs/util/srvkit";
import { DatabaseAdaptorRole, LlmAdaptorRole, serve } from "akanjs/service";
import { Stripe } from "stripe-sdk";
import { Stripe as LibStripe } from "@libs/util/srvkit";
import { Paypal, Square } from "@libs/shared/srvkit";
import { Clock, Mailer } from "../../plugin/mailer";
import * as db from "../db";
export class MemoService extends serve(db.memo, ({ plug, use }) => ({
  storageApi: plug(srvkit.StorageApi),
  database: plug(DatabaseAdaptorRole),
  mailer: plug(Mailer),
  clock: plug(Clock),
  stripe: plug(Stripe),
  billing: plug(LibStripe),
  mailgun: plug(srvkit.Mailgun),
  paypal: plug(Paypal),
  square: plug(Square),
  llm: plug(LlmAdaptorRole),
  option: use<string>(),
})) {
  async sweep(url: string) {
    await this.storageApi.deleteData(url);
    [url].forEach(function () {
      this.mailer.send();
    });
    const Local = class {
      mailer = { send: () => 1 };
      run() {
        return this.mailer.send();
      }
    };
    const literal = {
      mailer: { send: () => 1 },
      run() {
        return this.mailer.send();
      },
    };
    function nested() {
      return this.mailer.send();
    }
    return this.database.count(Local, literal, nested);
  }
  async stamp() {
    return this.clock.getMemo();
  }
  async settle() {
    await this.paypal.charge();
    return this.square.charge();
  }
  async charge() {
    await this.billing.pay();
    await this.mailgun.send();
    return this.stripe.pay();
  }
  async notify() {
    await this.llm.chat();
    return this.notifier.getMemo();
  }
}
`,
      "apps/demo/lib/memo/memo.signal.ts": `import { internal } from "akanjs/signal";
import * as srv from "../srv";
export class MemoInternal extends internal(
  srv.memo,
  ({ interval, cron, initialize, timeout, resolveField, destroy, process }) => ({
    ownerName: resolveField(String).exec(async function (memo) {
      return memo.owner;
    }),
    sweepMemos: interval(5 * 60 * 1000, { once: true, lock: false }).exec(async function () {
      await this.memoService.sweep("");
    }),
    reportMemos: cron("0 * * * *" as const, { serverMode: "batch", operationMode: ["cloud"] }).exec(
      async function () {},
    ),
    hourly: cron(EVERY_HOUR, { lock: false }).exec(async function () {}),
    seedMemos: initialize({ enabled: false, once: true, lock: false }).exec(async function () {}),
    cleanUp: destroy({ serverMode: ServerMode.batch, lock: false }).exec(async function () {}),
    handleMemo: process(cnst.Memo, { serverMode: "federation" }).exec(async function () {}),
    later: timeout(SECONDS, { lock: false }).exec(async function () {}),
  }),
) {}
`,
    };
    for (const [rel, text] of Object.entries(wired)) index.setFile(`${root}/${rel}`, text);
    const graph = index.graph((fileName) => wired[fileName.slice(root.length + 1)], { digests: true });
    const internals = graph.nodes.filter((node) => node.kind === "internal");
    expect(internals.map(({ id, label, detail }) => [id, label, detail])).toEqual([
      ["internal:apps/demo:memo.cleanUp", "MemoInternal.cleanUp", ["destroy", "batch"]],
      ["internal:apps/demo:memo.handleMemo", "MemoInternal.handleMemo", ["process", "federation"]],
      ["internal:apps/demo:memo.hourly", "MemoInternal.hourly", ["cron", "EVERY_HOUR"]],
      ["internal:apps/demo:memo.later", "MemoInternal.later", ["timeout", "SECONDS"]],
      ["internal:apps/demo:memo.reportMemos", "MemoInternal.reportMemos", ["cron", "0 * * * *", "batch", "cloud"]],
      ["internal:apps/demo:memo.seedMemos", "MemoInternal.seedMemos", ["initialize", "disabled", "once"]],
      ["internal:apps/demo:memo.sweepMemos", "MemoInternal.sweepMemos", ["interval", "5m", "unlocked"]],
    ]);
    const adaptors = graph.nodes.filter((node) => node.kind === "adaptor");
    expect(adaptors.map(({ id, detail, at, doc }) => [id, detail, at && `${at.file}:${at.line}`, doc ?? null])).toEqual(
      [
        ["adaptor::DatabaseAdaptorRole", ["akanjs"], null, null],
        ["adaptor::LlmAdaptorRole", ["akanjs"], null, null],
        ["adaptor:@mailgun/sdk:Client", ["@mailgun/sdk"], null, null],
        ["adaptor:apps/demo:ChatLlm", ["chatLlm"], "apps/demo/srvkit/chatLlm.ts:2", null],
        ["adaptor:apps/demo:Clock", ["clock"], "apps/demo/plugin/mailer.ts:2", null],
        ["adaptor:apps/demo:Mailer", ["mailer"], "apps/demo/plugin/mailer.ts:4", null],
        ["adaptor:apps/demo:Stripe", ["stripe"], "apps/demo/plugin/mailer.ts:3", null],
        ["adaptor:libs/shared:Notifier", ["notifier"], "libs/shared/srvkit/notifier.ts:2", null],
        ["adaptor:libs/util:BlobStorageApi", ["blobStorageApi"], "libs/util/srvkit/storageApi.ts:2", null],
        [
          "adaptor:libs/util:StorageApi",
          ["storageApi"],
          "libs/util/srvkit/storageApi.ts:5",
          "Stores files on the object store, or on disk when none is configured.",
        ],
        ["adaptor:paypal:Paypal", ["paypal"], null, null],
        ["adaptor:square-sdk:Square", ["square-sdk"], null, null],
        ["adaptor:stripe-sdk:Stripe", ["stripe-sdk"], null, null],
      ],
    );
    expect(edgesOf(graph, "plugs")).toEqual(["adaptor:libs/util:StorageApi -blob-> adaptor:libs/util:BlobStorageApi"]);
    expect(edgesOf(graph, "binds")).toEqual(["adaptor::LlmAdaptorRole -apps/demo-> adaptor:apps/demo:ChatLlm"]);
    expect(graph.edges.find((edge) => edge.kind === "binds")?.at).toEqual({
      file: "apps/demo/lib/option.ts",
      line: 4,
      column: 40,
    });
    expect(edgesOf(graph, "calls")).toEqual([
      "internal:apps/demo:memo.sweepMemos -sweep-> method:apps/demo:memo.sweep",
      "method:apps/demo:memo.charge -pay-> adaptor:stripe-sdk:Stripe",
      "method:apps/demo:memo.charge -send-> adaptor:@mailgun/sdk:Client",
      "method:apps/demo:memo.notify -chat-> adaptor::LlmAdaptorRole",
      "method:apps/demo:memo.notify -getMemo-> adaptor:libs/shared:Notifier",
      "method:apps/demo:memo.settle -charge-> adaptor:paypal:Paypal",
      "method:apps/demo:memo.settle -charge-> adaptor:square-sdk:Square",
      "method:apps/demo:memo.stamp -getMemo-> adaptor:apps/demo:Clock",
      "method:apps/demo:memo.sweep -count-> adaptor::DatabaseAdaptorRole",
      "method:apps/demo:memo.sweep -deleteData-> adaptor:libs/util:StorageApi",
      "method:libs/social:memo.pay -charge-> adaptor:paypal:Paypal",
    ]);
    expect(
      [...internals, ...adaptors.filter((node) => node.at)].every((node) => /^[0-9a-f]{8}$/.test(node.digest ?? "")),
    ).toBe(true);
  });

  it("keys two same-name adaptors of one owner by file, and follows the import that names one", () => {
    const clocks = (wallClock: string): Record<string, string> => ({
      "apps/demo/srvkit/mailer.ts": `import { adapt } from "akanjs/service";
export class Mailer extends adapt("mailer") {}
`,
      "apps/demo/srvkit/clockA.ts": `import { adapt } from "akanjs/service";
export class Clock extends adapt("clockA") {
  now() {
    return ${wallClock};
  }
}
`,
      "apps/demo/srvkit/clockB.ts": `import { adapt } from "akanjs/service";
import { Mailer } from "./mailer";
export class Clock extends adapt("clockB", ({ plug }) => ({ mailer: plug(Mailer) })) {}
`,
      "apps/demo/lib/memo/memo.service.ts": `import { serve } from "akanjs/service";
import { Clock } from "../../srvkit/clockB";
import * as db from "../db";
export class MemoService extends serve(db.memo, ({ plug }) => ({ clock: plug(Clock) })) {
  async stamp() {
    return this.clock.now();
  }
}
`,
    });
    const graphOf = (wired: Record<string, string>) => {
      const index = new AkanIndex({ ts, root });
      for (const [rel, text] of Object.entries(wired)) index.setFile(`${root}/${rel}`, text);
      return index.graph((fileName) => wired[fileName.slice(root.length + 1)], { digests: true });
    };
    const graph = graphOf(clocks("Date.now()"));
    expect(
      graph.nodes.filter((node) => node.kind === "adaptor").map(({ id, label, detail }) => [id, label, detail]),
    ).toEqual([
      ["adaptor:apps/demo:Mailer", "Mailer", ["mailer"]],
      ["adaptor:apps/demo:srvkit/clockA.ts#Clock", "Clock", ["clockA"]],
      ["adaptor:apps/demo:srvkit/clockB.ts#Clock", "Clock", ["clockB"]],
    ]);
    expect(edgesOf(graph, "plugs")).toEqual([
      "adaptor:apps/demo:srvkit/clockB.ts#Clock -mailer-> adaptor:apps/demo:Mailer",
    ]);
    expect(edgesOf(graph, "calls")).toEqual([
      "method:apps/demo:memo.stamp -now-> adaptor:apps/demo:srvkit/clockB.ts#Clock",
    ]);
    const changes = AkanGraphDiff.between(graph, graphOf(clocks("0")));
    expect(changes.nodes.filter((node) => node.change).map(({ id, change }) => `${change} ${id}`)).toEqual([
      "changed adaptor:apps/demo:srvkit/clockA.ts#Clock",
    ]);
    const { "apps/demo/srvkit/clockB.ts": _clockB, ...single } = clocks("Date.now()");
    const alone = graphOf({
      ...single,
      "apps/demo/lib/memo/memo.service.ts": single["apps/demo/lib/memo/memo.service.ts"].replace("clockB", "clockA"),
    });
    const paired = graphOf({
      ...clocks("Date.now()"),
      "apps/demo/lib/memo/memo.service.ts": single["apps/demo/lib/memo/memo.service.ts"].replace("clockB", "clockA"),
    });
    expect(alone.nodes.filter((node) => node.kind === "adaptor").map(({ id }) => id)).toEqual([
      "adaptor:apps/demo:Clock",
      "adaptor:apps/demo:Mailer",
    ]);
    const summarize = (diff: ReturnType<typeof AkanGraphDiff.between>) => [
      ...diff.nodes.filter((node) => node.change).map(({ id, change }) => `${change} ${id}`),
      ...diff.edges.filter((edge) => edge.change).map(({ from, to, change }) => `${change} ${from} -> ${to}`),
    ];
    expect(summarize(AkanGraphDiff.between(alone, paired))).toEqual([
      "added adaptor:apps/demo:srvkit/clockB.ts#Clock",
      "added adaptor:apps/demo:srvkit/clockB.ts#Clock -> adaptor:apps/demo:Mailer",
    ]);
    expect(summarize(AkanGraphDiff.between(paired, alone))).toEqual([
      "removed adaptor:apps/demo:srvkit/clockB.ts#Clock",
      "removed adaptor:apps/demo:srvkit/clockB.ts#Clock -> adaptor:apps/demo:Mailer",
    ]);
  });

  it("marks a job and an adaptor changed or removed in the Change Map", () => {
    const wired = (jobs: string, adaptors: string): Record<string, string> => ({
      "apps/demo/srvkit/mailer.ts": `import { adapt } from "akanjs/service";
${adaptors}`,
      "apps/demo/lib/memo/memo.signal.ts": `import { internal } from "akanjs/signal";
import * as srv from "../srv";
export class MemoInternal extends internal(srv.memo, ({ interval, cron }) => ({
${jobs}
})) {}
`,
    });
    const graphOf = (files: Record<string, string>) => {
      const index = new AkanIndex({ ts, root });
      for (const [rel, text] of Object.entries(files)) index.setFile(`${root}/${rel}`, text);
      return index.graph((fileName) => files[fileName.slice(root.length + 1)], { digests: true });
    };
    const base = graphOf(
      wired(
        `  sweepMemos: interval(5 * 60 * 1000).exec(async function () {}),
  reportMemos: cron("0 * * * *").exec(async function () {}),`,
        `export class Mailer extends adapt("mailer") {}
export class Clock extends adapt("clock") {}
`,
      ),
    );
    const head = graphOf(
      wired(
        "  sweepMemos: interval(10 * 60 * 1000).exec(async function () {}),",
        `export class Mailer extends adapt("mailer") {
  send() {
    return 1;
  }
}
`,
      ),
    );
    const changes = AkanGraphDiff.between(base, head);
    expect(changes.nodes.map(({ id, change, detail }) => [id, change, detail])).toEqual([
      ["adaptor:apps/demo:Clock", "removed", ["clock"]],
      ["adaptor:apps/demo:Mailer", "changed", ["mailer"]],
      ["internal:apps/demo:memo.reportMemos", "removed", ["cron", "0 * * * *"]],
      ["internal:apps/demo:memo.sweepMemos", "changed", ["interval", "10m"]],
    ]);
  });

  it("draws the same graph whatever order the files were read in", () => {
    const withFolder: Record<string, string> = {
      ...files,
      "apps/demo/lib/folder/folder.signal.ts": `import { slice } from "akanjs/signal";
import * as srv from "../srv";
export class FolderSlice extends slice(srv.folder, { guards: { root: Admin, get: Public } }, (init) => ({})) {}
`,
      "libs/shared/srvkit/resource.ts": `import type { Guard } from "akanjs/signal";
export const resourceGuard = (field: string) =>
  class implements Guard {
    canPass() {
      return !!field;
    }
  };
export class Admin implements Guard {
  canPass() {
    return true;
  }
}
`,
      "apps/demo/srvkit/guards.ts": `import { resourceGuard } from "@libs/shared/srvkit";
export const Admin = resourceGuard("admin");
`,
      "apps/demo/srvkit/clockA.ts": `import { adapt } from "akanjs/service";
// Reads the wall clock.
export class Clock extends adapt("clockA") {}
`,
      "apps/demo/srvkit/clockB.ts": `import { adapt } from "akanjs/service";
// Reads a frozen clock.
export class Clock extends adapt("clockB") {}
`,
    };
    const graphIn = (order: [string, string][]) => {
      const index = new AkanIndex({ ts, root });
      for (const [rel, text] of order) index.setFile(`${root}/${rel}`, text);
      return JSON.stringify(index.graph((fileName) => withFolder[fileName.slice(root.length + 1)], { digests: true }));
    };
    const graph = graphIn(Object.entries(withFolder));
    expect(graph).toContain('"from":"slice:apps/demo:folder","to":"guard:apps/demo:Admin"');
    expect(graph).toContain(
      '"id":"adaptor:apps/demo:srvkit/clockA.ts#Clock","kind":"adaptor","name":"Clock","label":"Clock","owner":"apps/demo","module":null,"detail":["clockA"],"at":{"file":"apps/demo/srvkit/clockA.ts","line":3,"column":14},"doc":"Reads the wall clock."',
    );
    expect(graph).toContain(
      '"id":"adaptor:apps/demo:srvkit/clockB.ts#Clock","kind":"adaptor","name":"Clock","label":"Clock","owner":"apps/demo","module":null,"detail":["clockB"],"at":{"file":"apps/demo/srvkit/clockB.ts","line":3,"column":14},"doc":"Reads a frozen clock."',
    );
    expect(graphIn(Object.entries(withFolder).reverse())).toBe(graph);
  });
});
