import "../../test/registerDom";
import { describe, expect, test } from "bun:test";
import { enumOf, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { store } from "../store";
import { StoreInstance } from "../storeInstance";
import { StoreRegistry } from "../storeRegistry";
import { useFieldTool } from "./useFieldTool";

class FormTestRole extends enumOf("formTestRole", ["owner", "guest"] as const) {}

class FormTestPayment extends via((f) => ({
  name: f(String),
  amount: f(Int),
  note: f.secret(String),
})) {}
ConstantRegistry.buildScalar("formTestPayment", FormTestPayment, {});

const Input = via((f) => ({
  title: f(String),
  role: f(FormTestRole),
  payments: f([FormTestPayment]),
  password: f.secret(String),
  memo: f.hidden(String),
}));
const Obj = via(Input, () => ({}));
const Light = via(Obj, ["title"] as const, () => ({}));
const Full = via(Obj, Light, () => ({}));
const Insight = via(Full, (f) => ({ count: f(Int, { default: 0 }) }));
ConstantRegistry.buildModel("formTestItem", Input, Obj, Full, Light, Insight, {});

const written: [string, unknown][] = [];
class FormStore extends store("formTest" as const, () => ({
  formTestItemForm: {} as { [key: string]: unknown },
})) {
  setTitleOnFormTestItem(value: string) {
    written.push(["title", value]);
  }
  setRoleOnFormTestItem(value: string) {
    written.push(["role", value]);
  }
  setPaymentsOnFormTestItem(value: unknown) {
    written.push(["payments", value]);
  }
}
StoreRegistry.register(FormStore);
const instance = new StoreInstance(StoreRegistry.merge("formRoot", FormStore));
const dispatch = instance.do as unknown as { [key: string]: (value: unknown) => void };

const mount = (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return () => {
    act(() => root.unmount());
    container.remove();
  };
};

interface ScreenOptions {
  agent?: boolean;
  controls?: unknown[];
  /** More than one component subscribing the same form — the shape `Model.EditModal` plus its `Template` makes. */
  forms?: number;
  transform?: unknown;
  disabled?: boolean;
}
const screen = (
  surface: AgenticSurface,
  { agent, controls = [], forms = 1, transform, disabled }: ScreenOptions = {},
) => {
  const Form = () => {
    instance.use.formTestItemForm?.(agent === undefined ? undefined : { agent });
    return null;
  };
  const Control = ({ onChange }: { onChange: unknown }) => {
    useFieldTool(onChange, { transform, disabled });
    return null;
  };
  return (
    <AgentProvider surface={surface}>
      {Array.from({ length: forms }, (_, idx) => (
        <Form key={idx} />
      ))}
      {controls.map((onChange, idx) => (
        <Control key={idx} onChange={onChange} />
      ))}
    </AgentProvider>
  );
};

describe("useFormTools", () => {
  test("subscribing a form publishes one patch tool describing every writable field", () => {
    const surface = new AgenticSurface();
    const unmount = mount(screen(surface));

    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual(["fillFormTestItemForm"]);
    expect(surface.snapshot().tools[0]?.parameters).toEqual({
      type: "object",
      properties: {
        title: { type: "string" },
        role: { type: "string", enum: ["owner", "guest"] },
        // Reaching a list of embedded objects is the whole reason this tool exists beside the per-field ones.
        payments: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, amount: { type: "integer" } },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    });
    unmount();
    expect(surface.snapshot().tools).toHaveLength(0);
  });

  test("refuses a field this screen renders no control for, and names the ones it does", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(screen(surface, { controls: [dispatch.setTitleOnFormTestItem] }));

    await surface.call("fillFormTestItemForm", { title: "Ada" });
    expect(written).toEqual([["title", "Ada"]]);
    await expect(surface.call("fillFormTestItemForm", { role: "owner" })).rejects.toThrow(
      "This screen offers no role on the formTestItem form. It offers: title, payments.",
    );
    unmount();
  });

  test("a composite is reachable without a control, because no control can name one", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(screen(surface));

    // Rows of a list are written through `writeOn<Model>(path, value)`, which carries no annotation, so the
    // guard has nothing to check and lets the whole list through.
    await surface.call("fillFormTestItemForm", { payments: [{ name: "deposit", amount: 100 }] });
    expect(written).toEqual([["payments", [{ name: "deposit", amount: 100 }]]]);
    await expect(
      surface.call("fillFormTestItemForm", { payments: [{ name: "deposit", amount: 1.5 }] }),
    ).rejects.toThrow('"payments[0].amount" of fillFormTestItemForm must be a whole number.');
    await expect(surface.call("fillFormTestItemForm", { payments: [{ name: "x", note: "y" }] })).rejects.toThrow(
      '"payments[0]" of fillFormTestItemForm has no field "note".',
    );
    unmount();
  });

  test("writes nothing when any part of the patch is bad", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(screen(surface, { controls: [dispatch.setTitleOnFormTestItem] }));

    await expect(
      surface.call("fillFormTestItemForm", { title: "Ada", payments: [{ name: "x", amount: "no" }] }),
    ).rejects.toThrow();
    expect(written).toEqual([]);
    unmount();
  });

  test("two components subscribing one form are one declaration, not a clash", () => {
    const surface = new AgenticSurface();
    const warned: string[] = [];
    const original = console.warn;
    console.warn = (message: string) => void warned.push(message);
    const unmount = mount(screen(surface, { forms: 2 }));
    console.warn = original;

    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual(["fillFormTestItemForm"]);
    expect(warned).toEqual([]);
    unmount();
    expect(surface.snapshot().tools).toHaveLength(0);
  });

  test("the patch goes through the control, so the control's transform applies to it too", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(
      screen(surface, {
        controls: [dispatch.setTitleOnFormTestItem],
        transform: (value: string) => value.trim().toUpperCase(),
      }),
    );

    await surface.call("fillFormTestItemForm", { title: "  ada  " });
    expect(written).toEqual([["title", "ADA"]]);
    unmount();
  });

  test("a disabled control closes its field to the patch tool as well", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(screen(surface, { controls: [dispatch.setTitleOnFormTestItem], disabled: true }));

    await expect(surface.call("fillFormTestItemForm", { title: "Ada" })).rejects.toThrow(
      "This screen offers no title on the formTestItem form.",
    );
    expect(written).toEqual([]);
    unmount();
  });

  // A tool schema is built from the effect, never from the render, so a field nothing can describe can never cost
  // a route its server rendering — the surface simply has no tools until the client commits.
  test("server rendering a form builds no schema", () => {
    const surface = new AgenticSurface();
    expect(() => renderToStaticMarkup(screen(surface))).not.toThrow();
    expect(surface.snapshot().tools).toHaveLength(0);
  });

  test("a form read with agent:false publishes nothing", () => {
    const surface = new AgenticSurface();
    const unmount = mount(screen(surface, { agent: false }));

    expect(surface.snapshot().tools).toHaveLength(0);
    unmount();
  });
});
