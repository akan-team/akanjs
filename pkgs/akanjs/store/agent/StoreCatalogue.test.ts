import { beforeAll, describe, expect, test } from "bun:test";
import { enumOf, Int, SLICE_META } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import type { ClientSignal } from "akanjs/fetch";
import type { SerializedSignal } from "akanjs/signal";
import { store } from "../store";
import { StoreInstance } from "../storeInstance";
import { StoreRegistry } from "../storeRegistry";
import { StoreCatalogue } from "./StoreCatalogue";

class CatalogueStatus extends enumOf("catalogueStatus", ["todo", "done"] as const) {}

const TaskInput = via((f) => ({
  title: f(String, { example: "Ship it" }),
  count: f(Int, { default: 0 }),
  status: f(CatalogueStatus, { default: "todo" }),
  secretMemo: f.secret(String).optional(),
}));
const TaskObject = via(TaskInput, () => ({}));
const TaskLight = via(TaskObject, ["title"] as const, () => ({}));
const TaskFull = via(TaskObject, TaskLight, () => ({}));
const TaskInsight = via(TaskFull, (f) => ({ count: f(Int, { default: 0 }) }));
const taskConstant = ConstantRegistry.buildModel(
  "catalogueTask",
  TaskInput,
  TaskObject,
  TaskFull,
  TaskLight,
  TaskInsight,
  { TaskInput, TaskObject, TaskFull, TaskLight, TaskInsight },
);

const serializedSignal: SerializedSignal = {
  prefix: "catalogueTask",
  getGuards: ["SignedIn"],
  cruGuards: ["SignedIn"],
  endpoint: {},
  slice: {
    "": { args: [] },
    byStatus: { args: [{ type: "param", name: "status", refName: "String", enum: "catalogueStatus" }] },
  },
};

const makeSignal = () => {
  const handlers: Record<string, unknown> = {};
  const fetch = new Proxy(handlers, {
    get: (target, key: string) => (target[key] ??= async () => null),
  });
  return {
    refName: "catalogueTask",
    _slice: { [SLICE_META]: {} },
    cnst: taskConstant,
    fetch,
    serializedSignal,
    slices: [],
  } as unknown as ClientSignal<"catalogueTask">;
};

let catalogue: StoreCatalogue;
let instance: StoreInstance;

beforeAll(() => {
  process.env.AKAN_PUBLIC_APP_NAME = "cataloguetest";
  process.env.AKAN_PUBLIC_REPO_NAME = "cataloguetest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";

  class TaskStore extends store(
    makeSignal(),
    () => ({ draft: "", openTaskIds: [] as string[] }),
    ({ computed }) => ({ draftLabel: computed(["draft"], (draft: string) => `draft:${draft}`) }),
  ) {
    wipeDraft() {
      this.set({ draft: "" });
    }
  }
  StoreRegistry.register(TaskStore);
  instance = new StoreInstance(StoreRegistry.merge("catalogueRoot", TaskStore));
  catalogue = new StoreCatalogue(instance);
});

describe("StoreCatalogue state", () => {
  test("reads the type off the live value and marks what cannot be written", () => {
    expect(catalogue.state.draft).toEqual({ type: "string", derived: false });
    expect(catalogue.state.draftLabel).toEqual({ type: "string", derived: true });
    expect(catalogue.state.openTaskIds?.type).toBe("list");
  });

  test("attributes a slice's own keys to its model and role", () => {
    expect(catalogue.state.pageOfCatalogueTaskByStatus).toEqual({
      type: "number",
      refName: "catalogueTask",
      role: "pageOfModel",
      derived: false,
    });
    expect(catalogue.state.catalogueTaskListByStatus?.role).toBe("modelList");
  });

  test("names the model from the declaration even when the value cannot", () => {
    // `STATE_META` holds initial values, not types, so a key that starts null says nothing about its shape — but
    // which model it belongs to is declared, and that is what a read of it has to be masked by.
    expect(catalogue.state.catalogueTask).toEqual({
      type: "unknown",
      refName: "catalogueTask",
      modelType: "full",
      derived: false,
    });
    // The form is the case that matters: `immerify` copies it into a plain object, so the value has no class left.
    expect(catalogue.state.catalogueTaskForm).toEqual({
      type: "object",
      refName: "catalogueTask",
      modelType: "input",
      derived: false,
    });
  });

  test("catalogues keys and nothing else — a store method is not an agent tool", () => {
    expect(instance.do.wipeDraft).toBeDefined();
    expect(catalogue.state.wipeDraft).toBeUndefined();
    expect("action" in catalogue).toBe(false);
  });

  test("keys are sorted, so the catalogue text is the same on the next boot", () => {
    const keys = Object.keys(catalogue.state);
    expect([...keys].sort()).toEqual(keys);
  });
});

describe("StoreCatalogue framework keys", () => {
  test("catalogues the framework store; liveness decides what an agent may read", async () => {
    const { BaseStore } = await import("../baseSt");
    const scoped = new StoreInstance(StoreRegistry.merge("catalogueBaseRoot", BaseStore));
    const baseCatalogue = new StoreCatalogue(scoped);
    expect(baseCatalogue.state.tryJwt).toEqual({ type: "unknown", derived: false });
    expect(baseCatalogue.state.path).toEqual({ type: "string", derived: false });
    expect(baseCatalogue.state.theme).toEqual({ type: "string", derived: false });
    expect(baseCatalogue.refusals).toEqual([]);
  });
});
