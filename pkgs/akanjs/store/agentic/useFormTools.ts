"use client";
import { capitalize } from "akanjs/common";
import { AgenticSurface, useScopePath, useSurface } from "use-agentic";
// Through the `"use client"` shim, not `react` — see `StToolBuilder`.
import { useEffect, useRef } from "../hooks";
import { FormFields } from "./formFields";

/**
 * One tool that fills several fields of a form at once, published while a component subscribes `<model>Form`.
 *
 * The per-field setters are published by the controls themselves (`useFieldTool`), which is what keeps them to
 * the fields this screen draws. This one exists for what a control cannot reach: a list, a map, an embedded
 * object — the shapes a `st.tool` argument cannot describe one control at a time — and for filling a fresh form
 * in one call. It is a patch, not a replacement, so it never clears what the person already typed.
 *
 * Its schema is every writable field of the model, because a declaration is mount-static and cannot know which
 * controls will render. The **guard** is where the screen gets its say: a plain field has to have published its
 * own setter, and a composite is waved through because its rows are written with `writeOn<Model>(path, value)`,
 * which no control can annotate — so this is the one place an agent can reach a field the screen may not show.
 *
 * The entry is a pure function of `refName`: the schema comes from the model, the guard re-reads the live surface,
 * and every `write` reaches the one store instance. So a form put on screen by a shell that subscribes it
 * (`Model.EditModal`) and by the `Template` inside it registers one declaration twice — the same description both
 * times, which is what the surface reads as interchangeable rather than as a clash an app has to suppress.
 */
export const useFormTools = (refName: string | null, write: (action: string, value: unknown) => void) => {
  const surface = useSurface();
  const scope = useScopePath();
  const live = useRef(write);
  live.current = write;
  const scopeKey = scope.join(".");
  useEffect(() => {
    if (!refName) return;
    const fields = FormFields.patchable(refName);
    if (!fields.length) return;
    const byKey = new Map(fields.map((entry) => [entry.key, entry]));
    const name = `fill${capitalize(refName)}Form`;
    const offered = () =>
      fields.filter(
        (entry) =>
          FormFields.isComposite(entry.field) || !!surface.tool(AgenticSurface.fullName(scope, entry.action), scope),
      );
    return surface.registerTool(scope, {
      name,
      description: `Fill fields of the ${refName} form. Sends a patch — a field left out keeps its value.`,
      parameters: {
        type: "object",
        properties: Object.fromEntries(fields.map((entry) => [entry.key, entry.schema])),
        additionalProperties: false,
      },
      guard: (args) => {
        const keys = Object.keys(args);
        if (!keys.length) return "Name at least one field to fill.";
        const open = new Set(offered().map((entry) => entry.key));
        const closed = keys.filter((key) => !open.has(key));
        if (!closed.length) return true;
        return `This screen offers no ${closed.join(", ")} on the ${refName} form. It offers: ${
          [...open].join(", ") || "nothing"
        }.`;
      },
      run: (args) => {
        // Checked in full before anything is written: a patch that fails halfway would leave the form in a state
        // neither the person nor the agent asked for.
        const patch = Object.entries(args).map(([key, value]) => {
          const entry = byKey.get(key);
          if (!entry) throw new Error(`The ${refName} form has no field "${key}".`);
          return { entry, value: FormFields.checked(name, key, entry.field, value) };
        });
        // Written through the control's own published tool wherever there is one, not the setter underneath it.
        // That is what carries the control's `transform`, so a field cannot normalize one way for `set<Field>On…`
        // and another way for this patch. A composite the guard waved through has no control, and dispatches.
        for (const { entry, value } of patch) {
          const control = surface.tool(AgenticSurface.fullName(scope, entry.action), scope);
          if (control) void control.run({ value });
          else live.current(entry.action, value);
        }
      },
    });
  }, [surface, scopeKey, refName]);
};
