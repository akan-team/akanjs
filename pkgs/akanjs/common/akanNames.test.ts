import { describe, expect, test } from "bun:test";
import path from "node:path";
import ts from "typescript";
import {
  databaseStateNames,
  endpointNames,
  formSetterNames,
  modelNames,
  moduleNames,
  queryNames,
  sliceNames,
  stateSetterName,
} from "./akanNames";

const fixturePath = path.join(import.meta.dir, "akanNames.typeFixture.ts").replaceAll("\\", "/");
const fixtureSource = `import { Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { by, DatabaseRegistry, from, into } from "akanjs/document";
import { FetchClient, type FetchClientType } from "akanjs/fetch";
import { ServiceModel, serve } from "akanjs/service";
import { endpoint, internal, Public, SignalRegistry, serverSignal, slice } from "akanjs/signal";
import { StoreRegistry, store } from "akanjs/store";

export class GizmoInput extends via((field) => ({
  name: field(String),
  tags: field([String]),
})) {}
export class GizmoObject extends via(GizmoInput, (field) => ({
  count: field(Int, { default: 0 }),
})) {}
export class LightGizmo extends via(GizmoObject, ["name"] as const, (resolve) => ({})) {}
export class Gizmo extends via(GizmoObject, LightGizmo, (resolve) => ({})) {}
export class GizmoInsight extends via(Gizmo, (field) => ({})) {}
const gizmoCnstModule = { GizmoInput, GizmoObject, LightGizmo, Gizmo, GizmoInsight };
export const gizmoCnst = ConstantRegistry.buildModel(
  "gizmo" as const,
  GizmoInput,
  GizmoObject,
  Gizmo,
  LightGizmo,
  GizmoInsight,
  gizmoCnstModule,
  "fixture",
);

export class GizmoFilter extends from(Gizmo, (filter) => ({
  query: {
    byName: filter()
      .opt("name", String)
      .query((name) => ({ name })),
  },
  sort: {},
})) {}
export class GizmoDoc extends by(Gizmo) {}
export class GizmoModel extends into(GizmoDoc, GizmoFilter, gizmoCnst, () => ({})) {}
class GizmoInputDoc extends by(GizmoInput) {}
class GizmoInsightDoc extends by(GizmoInsight) {}
export const gizmoDb = DatabaseRegistry.buildModel(
  "gizmo" as const,
  GizmoInputDoc,
  GizmoDoc,
  GizmoModel,
  Gizmo,
  GizmoInsightDoc,
  GizmoFilter,
);

export class GizmoService extends serve(gizmoDb, () => ({})) {}
export const gizmoSrv = ServiceModel.fromModel(GizmoService, gizmoCnst, gizmoDb);

export class GizmoInternal extends internal(gizmoSrv, () => ({})) {}
export class GizmoSlice extends slice(gizmoSrv, { guards: { root: Public, get: Public, cru: Public } }, (init) => ({
  inPublic: init({ guards: [Public] })
    .live()
    .exec(function () {
      return this.gizmoService.queryByName();
    }),
})) {}
export class GizmoEndpoint extends endpoint(gizmoSrv, ({ pubsub, message }) => ({
  gizmoMoved: pubsub(Int, { guards: [Public] })
    .room("roomId", String)
    .exec(() => undefined),
  gizmoPing: message(Boolean, { guards: [Public] })
    .msg("roomId", String)
    .exec(() => true),
})) {}
export class GizmoSignal extends serverSignal(GizmoEndpoint, GizmoInternal) {}
export const gizmo = SignalRegistry.registerDatabase(
  "gizmo" as const,
  GizmoInternal,
  GizmoEndpoint,
  GizmoSlice,
  GizmoSignal,
  "fixture",
);
export const fetchSignals = [gizmo] as const;
export type Fetch = FetchClientType<typeof fetchSignals>;
type SigModule = { fetch: Fetch; gizmo: typeof gizmo };
type Proto = ReturnType<typeof FetchClient.build<SigModule>>;
declare const sig: Proto["sig"];

export class GizmoStore extends store(sig.gizmo, () => ({})) {}
export class FixtureRootStore extends StoreRegistry.merge("fixture" as const, StoreRegistry.register(GizmoStore)) {}
export const st = StoreRegistry.build(FixtureRootStore);

export type StoreState = typeof st.use;
export type StoreAction = typeof st.do;
export type ViewData = Awaited<ReturnType<Fetch["viewGizmo"]>>;
export type ServerViewData = Awaited<ReturnType<Fetch["getGizmoView"]>>;
export type EditData = Awaited<ReturnType<Fetch["editGizmo"]>>;
export type ServerEditData = Awaited<ReturnType<Fetch["getGizmoEdit"]>>;
export type RootInitData = Awaited<ReturnType<Fetch["initGizmo"]>>;
export type InitData = Awaited<ReturnType<Fetch["initGizmoInPublic"]>>;
export type ServerInitData = Awaited<ReturnType<Fetch["getGizmoInitInPublic"]>>;
`;

const compileFixture = () => {
  const config = ts.getParsedCommandLineOfConfigFile(
    path.join(import.meta.dir, "../tsconfig.json"),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      },
    },
  );
  if (!config) throw new Error("pkgs/akanjs/tsconfig.json did not parse");
  const host = ts.createCompilerHost(config.options);
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (file, languageVersion, ...rest) =>
    file === fixturePath
      ? ts.createSourceFile(file, fixtureSource, languageVersion, true)
      : getSourceFile(file, languageVersion, ...rest);
  host.fileExists = (file) => file === fixturePath || fileExists(file);
  host.readFile = (file) => (file === fixturePath ? fixtureSource : readFile(file));
  const program = ts.createProgram([fixturePath], { ...config.options, noEmit: true }, host);
  const sourceFile = program.getSourceFile(fixturePath);
  if (!sourceFile) throw new Error("the fixture did not load");
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  const exported = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
  const diagnostics = ts
    .getPreEmitDiagnostics(program, sourceFile)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  const propertiesOf = (exportName: string, derived: (name: string) => boolean) => {
    const symbol = exported.find(({ name }) => name === exportName);
    if (!symbol) throw new Error(`the fixture exports no ${exportName}`);
    return checker
      .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))
      .map(({ name }) => name)
      .filter(derived)
      .sort();
  };
  return { diagnostics, propertiesOf };
};

const fixture = compileFixture();
const byRef = (name: string) => /gizmo/i.test(name);
const byRefOrQuery = (name: string) => byRef(name) || /(Any|ByName)$/.test(name);

const refName = "gizmo";
const model = modelNames(refName);
const slices = ["", "inPublic"].map((suffix) => sliceNames(refName, suffix));
const [rootSlice, publicSlice] = slices as [ReturnType<typeof sliceNames>, ReturnType<typeof sliceNames>];
const queries = ["any", "byName"].map(queryNames);
const scalarSetters = ["name", "count", "id", "createdAt", "updatedAt", "removedAt"].map((key) =>
  formSetterNames("Gizmo", key),
);
const arraySetters = ["tags"].map((key) => formSetterNames("Gizmo", key));
const stateKeys = [
  ...new Set([...Object.values(databaseStateNames(refName)), ...slices.flatMap(({ state }) => Object.values(state))]),
];
const pubsub = endpointNames("gizmoMoved");
const message = endpointNames("gizmoPing");

const probes: { type: string; derived: (name: string) => boolean; names: string[] }[] = [
  {
    type: "Fetch",
    derived: byRef,
    names: [
      model.model,
      model.lightModel,
      model.createModel,
      model.updateModel,
      model.removeModel,
      model.viewModel,
      model.getModelView,
      model.editModel,
      model.getModelEdit,
      model.addModelFiles,
      model.mergeModel,
      ...slices.flatMap(({ endpoint }) => [endpoint.list, endpoint.insight, endpoint.init, endpoint.getInit]),
      "gizmoPing",
      pubsub.subscribe,
      message.listen,
    ],
  },
  { type: "StoreState", derived: byRef, names: stateKeys },
  {
    type: "StoreAction",
    derived: byRef,
    names: [
      model.createModel,
      model.updateModel,
      model.removeModel,
      model.viewModel,
      model.editModel,
      model.mergeModel,
      model.createModelInForm,
      model.updateModelInForm,
      model.checkModelSubmitable,
      model.submitModel,
      model.newModel,
      model.loadModelFormDraft,
      model.restoreModelFormDraft,
      model.discardModelFormDraft,
      model.setModel,
      model.resetModel,
      model.invalidateModel,
      model.writeOnModel,
      ...slices.flatMap(({ action }) => [
        action.initModel,
        action.refreshModel,
        action.selectModel,
        action.setPageOfModel,
        action.loadMoreOfModel,
        action.setLimitOfModel,
        action.setQueryArgsOfModel,
        action.setSortOfModel,
      ]),
      ...[...scalarSetters, ...arraySetters].map(({ setFieldOnModel }) => setFieldOnModel),
      ...arraySetters.flatMap((names) => [names.addFieldOnModel, names.subFieldOnModel, names.addOrSubFieldOnModel]),
      ...stateKeys.map(stateSetterName),
    ],
  },
  {
    type: "GizmoModel",
    derived: byRefOrQuery,
    names: [
      model.getModel,
      model.loadModel,
      model.loadModelMany,
      model.createModel,
      model.updateModel,
      model.removeModel,
      model.modelLoader,
      model.modelCache,
      ...queries.flatMap((names) => Object.values(names)),
    ],
  },
  {
    type: "GizmoService",
    derived: byRefOrQuery,
    names: [
      model.modelModel,
      model.getModel,
      model.loadModel,
      model.loadModelMany,
      model.createModel,
      model.updateModel,
      model.removeModel,
      ...queries.flatMap((names) => Object.values(names)),
    ],
  },
  { type: "ViewData", derived: byRef, names: [model.model, model.modelView] },
  { type: "ServerViewData", derived: byRef, names: [model.modelObj, model.modelViewAt] },
  { type: "EditData", derived: byRef, names: [model.model, model.modelEdit] },
  { type: "ServerEditData", derived: byRef, names: [model.modelObj, model.modelViewAt] },
  {
    type: "RootInitData",
    derived: byRef,
    names: [rootSlice.endpoint.initResult, rootSlice.endpoint.list, rootSlice.endpoint.insight],
  },
  {
    type: "InitData",
    derived: byRef,
    names: [publicSlice.endpoint.initResult, publicSlice.endpoint.list, publicSlice.endpoint.insight],
  },
  {
    type: "ServerInitData",
    derived: byRef,
    names: [
      model.modelObjList,
      model.modelObjInsight,
      rootSlice.state.pageOfModel,
      rootSlice.state.lastPageOfModel,
      rootSlice.state.limitOfModel,
      rootSlice.state.hasMoreOfModel,
      rootSlice.state.queryArgsOfModel,
      rootSlice.state.sortOfModel,
      rootSlice.state.modelInitAt,
    ],
  },
];

const typeOnly: { [type: string]: string[] } = { GizmoModel: ["Gizmo"] };
const runtimeOnly: { type: string; names: string[] }[] = [
  { type: "Fetch", names: [publicSlice.endpoint.live, publicSlice.endpoint.subscribeLive] },
  { type: "StoreAction", names: slices.flatMap(({ action }) => [action.applyLiveModel, action.watchLiveModel]) },
];
const untypedRoles: { [role: string]: string } = {
  "sliceNames.slice": "a SliceMeta value, never a property key",
  "modelNames.modelId": "an endpoint argument name",
  "modelNames.setViewOfModel": "an agent tool the list UI publishes, not a store action",
  "modelNames.exportCsvOfModel": "an agent tool the list UI publishes, not a store action",
  "modelNames.exportJsonOfModel": "an agent tool the list UI publishes, not a store action",
  "moduleNames.service": "the service's key on a signal's `this`",
  "moduleNames.ServiceClass": "a class name the author declares",
  "moduleNames.SliceClass": "a class name the author declares",
  "moduleNames.ModelClass": "a class name the author declares",
  "moduleNames.FilterClass": "a class name the author declares",
  "moduleNames.SignalClass": "a class name the author declares",
  "moduleNames.InternalClass": "a class name the author declares",
  "moduleNames.EndpointClass": "a class name the author declares",
  "formSetterNames.field": "a part of a name",
  "formSetterNames.Field": "a part of a name",
  "formSetterNames.moveFieldOnModel": "an agent tool, no store action answers to it",
  "formSetterNames.uploadFieldOnModel": "typed only for a ProtoLightFile field, which the fixture does not declare",
  "formSetterNames.postSetField": "a hook a store subclass declares",
};

const liveOnlyRoles = new Set(["sliceNames.endpoint.live", "sliceNames.endpoint.subscribeLive"]);
const arrayOnlyRoles = new Set([
  "formSetterNames.addFieldOnModel",
  "formSetterNames.subFieldOnModel",
  "formSetterNames.addOrSubFieldOnModel",
]);
const rolesOf = (table: string, names: { [role: string]: string }) =>
  Object.entries(names).map(([role, name]) => ({ role: `${table}.${role}`, name }));

describe("akanNames against the mapped types", () => {
  test("the fixture typechecks", () => {
    expect(fixture.diagnostics).toEqual([]);
  });

  test.each(probes.map((probe) => [probe.type, probe] as const))(
    "%s carries exactly the table's names",
    (type, probe) => {
      const expected = [...new Set([...probe.names, ...(typeOnly[type] ?? [])])].sort();
      expect(fixture.propertiesOf(type, probe.derived)).toEqual(expected);
    },
  );

  test("the runtime registers names no mapped type declares", () => {
    for (const { type, names } of runtimeOnly) {
      const typed = fixture.propertiesOf(type, byRefOrQuery);
      expect(names.filter((name) => typed.includes(name))).toEqual([]);
    }
  });

  test("every table role is probed or named as untyped", () => {
    const covered = new Set([...probes.flatMap(({ names }) => names), ...runtimeOnly.flatMap(({ names }) => names)]);
    const roles = [
      ...slices.flatMap((names) => [
        { role: "sliceNames.slice", name: names.slice },
        ...rolesOf("sliceNames.state", names.state),
        ...rolesOf("sliceNames.action", names.action),
        ...rolesOf("sliceNames.endpoint", names.endpoint).filter(
          ({ role }) => names === publicSlice || !liveOnlyRoles.has(role),
        ),
      ]),
      ...queries.flatMap((names) => rolesOf("queryNames", names)),
      ...rolesOf("databaseStateNames", databaseStateNames(refName)),
      ...rolesOf("modelNames", model),
      ...rolesOf("moduleNames", moduleNames(refName)),
      ...scalarSetters.flatMap((names) =>
        rolesOf("formSetterNames", names).filter(({ role }) => !arrayOnlyRoles.has(role)),
      ),
      ...arraySetters.flatMap((names) => rolesOf("formSetterNames", names)),
      ...stateKeys.map((key) => ({ role: "stateSetterName", name: stateSetterName(key) })),
      { role: "endpointNames.subscribe", name: pubsub.subscribe },
      { role: "endpointNames.listen", name: message.listen },
    ];
    const uncovered = [
      ...new Set(roles.filter(({ role, name }) => !covered.has(name) && !untypedRoles[role]).map(({ role }) => role)),
    ];
    expect(uncovered).toEqual([]);
    const stale = Object.keys(untypedRoles).filter((role) =>
      roles.filter((entry) => entry.role === role).every(({ name }) => covered.has(name)),
    );
    expect(stale).toEqual([]);
  });
});
