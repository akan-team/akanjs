import "../../test/registerDom";
import { describe, expect, test } from "bun:test";
import { dayjs, enumOf, Float, ID, Int } from "akanjs/base";
import { Err } from "akanjs/dictionary";
import { act, useState } from "react";
import { AgenticSurface, AgentProvider, type ToolEntry, ToolRunner } from "use-agentic";
import { actionTagOf } from "../actionTag";
import { mount } from "../mount.fixture";
import { AgentConfirm } from "./AgentConfirm";
import { StToolBuilder } from "./StToolBuilder";
import { StToolDraft } from "./StToolDraft";

class StToolMode extends enumOf("stToolMode", ["fit", "fill"] as const) {}
class StToolLevel extends enumOf("stToolLevel", [1, 2, 3] as const) {}

describe("StToolBuilder", () => {
  test("parametersOf compiles scalars and enums into one named-object schema", () => {
    expect(
      StToolBuilder.parametersOf([
        { name: "sceneId", type: ID, optional: false },
        { name: "toIndex", type: Int, optional: false },
        { name: "ratio", type: Float, optional: true },
        { name: "mode", type: StToolMode, optional: false },
        { name: "startAt", type: Date, optional: true },
        { name: "notify", type: Boolean, optional: false },
      ]),
    ).toEqual({
      type: "object",
      properties: {
        sceneId: { type: "string" },
        toIndex: { type: "integer" },
        ratio: { type: "number" },
        mode: { type: "string", enum: ["fit", "fill"] },
        startAt: { type: "string", format: "date-time" },
        notify: { type: "boolean" },
      },
      required: ["sceneId", "toIndex", "mode", "notify"],
      additionalProperties: false,
    });
  });

  test("no declared arguments publishes no schema", () => {
    expect(StToolBuilder.parametersOf([])).toBeUndefined();
  });

  test("a model class or Map is rejected by name where it is declared", () => {
    class NotAScalar {}
    expect(() => StToolBuilder.schemaOf(NotAScalar as unknown as typeof ID)).toThrow(
      "the type NotAScalar, and st.tool takes a scalar, an enum, or one array of either.",
    );
    expect(() => StToolBuilder.schemaOf(Map as unknown as typeof ID)).toThrow(
      "the type Map, and st.tool takes a scalar, an enum, or one array of either.",
    );
  });

  test("an undescribable argument withdraws the tool instead of aborting the render", () => {
    class PortfolioInfo {}
    const surface = new AgenticSurface();
    const errors: string[] = [];
    const console_ = console.error;
    console.error = (message: unknown) => errors.push(String(message));
    let clicked = 0;
    const Widget = () => {
      const edit = new StToolDraft("editProject")
        .desc("Edit one project.")
        .arg("projectId", ID)
        .arg("info", PortfolioInfo as unknown as typeof ID)
        .exec(() => {
          clicked += 1;
        });
      return <button onClick={() => void edit("p1", "x")} type="button" />;
    };
    try {
      const unmount = mount(<AgentProvider surface={surface}>{<Widget />}</AgentProvider>);
      expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual([]);
      expect(errors).toEqual([
        'st.tool("editProject") is not published: its "info" argument is the type PortfolioInfo, and st.tool takes a scalar, an enum, or one array of either.',
      ]);
      unmount();
    } finally {
      console.error = console_;
    }
    expect(clicked).toBe(0);
  });

  test("a withdrawn tool keeps the callable a person clicks, unannotated", async () => {
    class PortfolioInfo {}
    const surface = new AgenticSurface();
    const console_ = console.error;
    console.error = () => undefined;
    const calls: unknown[][] = [];
    const held: { edit?: (id: string, info: string) => Promise<void> } = {};
    const Widget = () => {
      held.edit = new StToolDraft("editProject")
        .desc("Edit one project.")
        .arg("projectId", ID)
        .arg("info", PortfolioInfo as unknown as typeof ID)
        .exec((...args) => {
          calls.push(args);
        });
      return null;
    };
    try {
      const unmount = mount(<AgentProvider surface={surface}>{<Widget />}</AgentProvider>);
      await held.edit?.("p1", "typed");
      expect(calls).toEqual([["p1", "typed"]]);
      expect(actionTagOf(held.edit)).toBeUndefined();
      unmount();
    } finally {
      console.error = console_;
    }
  });

  test("checkedValue enforces the published schema and coerces a date", () => {
    expect(() => StToolBuilder.checkedValue("reorder", "toIndex", Int, "3")).toThrow(
      'Argument "toIndex" of reorder must be a whole number.',
    );
    expect(() => StToolBuilder.checkedValue("setMode", "mode", StToolMode, "zoom")).toThrow(
      'Argument "mode" of setMode must be one of: fit, fill.',
    );
    expect(StToolBuilder.checkedValue("setMode", "mode", StToolMode, "fill")).toBe("fill");
    const parsed = StToolBuilder.checkedValue("schedule", "startAt", Date, "2026-08-19T09:00:00Z");
    expect(dayjs.isDayjs(parsed)).toBe(true);
    expect(() => StToolBuilder.checkedValue("schedule", "startAt", Date, "not-a-date")).toThrow(
      'Argument "startAt" of schedule must be an ISO 8601 date string.',
    );
  });

  test("oneOf narrows a scalar to a value set only the render knows", () => {
    const args = [{ name: "sortKey", type: String, optional: false, oneOf: ["latest", "oldest"] as const }];
    expect(StToolBuilder.parametersOf(args)).toEqual({
      type: "object",
      properties: { sortKey: { type: "string", enum: ["latest", "oldest"] } },
      required: ["sortKey"],
      additionalProperties: false,
    });
    expect(StToolBuilder.positionalOf("sortList", args, { sortKey: "oldest" })).toEqual(["oldest"]);
    expect(() => StToolBuilder.positionalOf("sortList", args, { sortKey: "title" })).toThrow(
      'Argument "sortKey" of sortList must be one of: latest, oldest.',
    );
  });

  test("one array level of a scalar or an enum is describable, the same shape a form field publishes", () => {
    const args = [
      { name: "bodies", type: [String] as const, optional: false },
      { name: "modes", type: [StToolMode] as const, optional: true },
    ];
    expect(StToolBuilder.parametersOf(args)).toEqual({
      type: "object",
      properties: {
        bodies: { type: "array", items: { type: "string" } },
        modes: { type: "array", items: { type: "string", enum: ["fit", "fill"] } },
      },
      required: ["bodies"],
      additionalProperties: false,
    });
    expect(StToolBuilder.positionalOf("rewrite", args, { bodies: ["one", "two"] })).toEqual([["one", "two"], null]);
    expect(() => StToolBuilder.positionalOf("rewrite", args, { bodies: "one\ntwo" })).toThrow(
      'Argument "bodies" of rewrite must be an array.',
    );
    expect(() => StToolBuilder.positionalOf("rewrite", args, { bodies: ["one", 2] })).toThrow(
      'Argument "bodies[1]" of rewrite must be a string.',
    );
  });

  test("oneOf narrows the elements of an array argument", () => {
    const args = [{ name: "keys", type: [String] as const, optional: false, oneOf: ["latest", "oldest"] as const }];
    expect(StToolBuilder.parametersOf(args)).toEqual({
      type: "object",
      properties: { keys: { type: "array", items: { type: "string", enum: ["latest", "oldest"] } } },
      required: ["keys"],
      additionalProperties: false,
    });
    expect(StToolBuilder.positionalOf("sortList", args, { keys: ["oldest"] })).toEqual([["oldest"]]);
    expect(() => StToolBuilder.positionalOf("sortList", args, { keys: ["title"] })).toThrow(
      'Argument "keys[0]" of sortList must be one of: latest, oldest.',
    );
  });

  test("a second array level is refused where it is declared, like any undescribable type", () => {
    expect(() => StToolBuilder.parametersOf([{ name: "grid", type: [[String]] as never, optional: false }])).toThrow(
      "an array of arrays, and st.tool takes one array level of a scalar or an enum.",
    );
  });

  test("positionalOf maps named arguments into declared order and nulls omitted optionals", () => {
    const args = [
      { name: "sceneId", type: ID, optional: false },
      { name: "ratio", type: Float, optional: true },
    ];
    expect(StToolBuilder.positionalOf("resize", args, { sceneId: "s1" })).toEqual(["s1", null]);
    expect(() => StToolBuilder.positionalOf("resize", args, { ratio: 2 })).toThrow(
      'Missing argument "sceneId" for resize.',
    );
  });
});

describe("StToolBuilder.exec", () => {
  test("publishes the tool and tags the callable", async () => {
    const surface = new AgenticSurface();
    // The declared type is the assertion: `oneOf` narrows the callable to the value set, not to the base scalar.
    const tab: { switchTab?: (menu: "one" | "two") => Promise<void> } = {};
    const seen: string[] = [];
    const Tabs = () => {
      tab.switchTab = new StToolDraft("switchTab")
        .desc("Switch the tab.")
        .arg("menu", String, { oneOf: ["one", "two"] })
        .exec((menu) => void seen.push(menu));
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Tabs />
      </AgentProvider>,
    );
    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual(["switchTab"]);
    expect(actionTagOf(tab.switchTab)?.action).toBe("switchTab");
    await surface.call("switchTab", { menu: "two" });
    expect(seen).toEqual(["two"]);
    await expect(surface.call("switchTab", { menu: "three" })).rejects.toThrow(
      'Argument "menu" of switchTab must be one of: one, two.',
    );
    unmount();
  });

  test("a tool whose exec threw a domain error answers the model its key as the code", async () => {
    const surface = new AgenticSurface();
    const Held = () => {
      new StToolDraft("holdTask").desc("Hold the task.").exec(() => {
        throw new Err.Conflict("base.error.idempotencyInFlight");
      });
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Held />
      </AgentProvider>,
    );
    const answered = await new ToolRunner(surface).run(
      { id: "c1", name: "holdTask", args: {} },
      new AbortController().signal,
    );
    expect(answered).toMatchObject({ error: "base.error.idempotencyInFlight", code: "base.error.idempotencyInFlight" });
    unmount();
  });

  test("an array argument reaches the callable as an array of its element", async () => {
    const surface = new AgenticSurface();
    // The declared type is the assertion: one array level carries through to the callable, `oneOf` and all.
    const held: { rewrite?: (bodies: string[], keys: ("a" | "b")[] | null) => Promise<void> } = {};
    const seen: unknown[] = [];
    const Plan = () => {
      held.rewrite = new StToolDraft("rewriteBeats")
        .desc("Rewrite every beat of the plan.")
        .arg("bodies", [String])
        .opt("keys", [String], { oneOf: ["a", "b"] })
        // The parameters are the assertion too: a wider `unknown[]` would still assign to `held.rewrite`.
        .exec((bodies, keys) => {
          const narrowed: ("a" | "b")[] = keys ?? [];
          seen.push([bodies.map((body) => body.trim()), narrowed.length ? narrowed : keys]);
        });
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Plan />
      </AgentProvider>,
    );
    expect(surface.snapshot().tools[0]?.parameters).toEqual({
      type: "object",
      properties: {
        bodies: { type: "array", items: { type: "string" } },
        keys: { type: "array", items: { type: "string", enum: ["a", "b"] } },
      },
      required: ["bodies"],
      additionalProperties: false,
    });
    await surface.call("rewriteBeats", { bodies: ["one", "two"] });
    expect(seen).toEqual([[["one", "two"], null]]);
    await expect(surface.call("rewriteBeats", { bodies: ["one"], keys: ["c"] })).rejects.toThrow(
      'Argument "keys[0]" of rewriteBeats must be one of: a, b.',
    );
    unmount();
  });

  test("an enum argument carries its own value set — no oneOf, and the callable narrows to it", async () => {
    const surface = new AgenticSurface();
    // The declared type is the assertion: an enum arg narrows to its values, an Int-backed one to its numbers.
    const held: { setMode?: (mode: "fit" | "fill", level: 1 | 2 | 3) => Promise<void> } = {};
    const seen: unknown[] = [];
    const Panel = () => {
      held.setMode = new StToolDraft("setMode")
        .desc("Set the mode.")
        .arg("mode", StToolMode)
        .arg("level", StToolLevel)
        .exec((mode, level) => void seen.push([mode, level]));
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Panel />
      </AgentProvider>,
    );

    expect(surface.snapshot().tools[0]?.parameters).toEqual({
      type: "object",
      properties: {
        mode: { type: "string", enum: ["fit", "fill"] },
        level: { type: "integer", enum: [1, 2, 3] },
      },
      required: ["mode", "level"],
      additionalProperties: false,
    });
    await surface.call("setMode", { mode: "fill", level: 2 });
    expect(seen).toEqual([["fill", 2]]);
    await expect(surface.call("setMode", { mode: "zoom", level: 2 })).rejects.toThrow(
      'Argument "mode" of setMode must be one of: fit, fill.',
    );
    await expect(surface.call("setMode", { mode: "fit", level: 9 })).rejects.toThrow(
      'Argument "level" of setMode must be one of: 1, 2, 3.',
    );
    unmount();
  });

  test("a falsy name declares nothing and still drives the click", async () => {
    const surface = new AgenticSurface();
    const tab: { switchTab?: (menu: string) => Promise<void> } = {};
    const seen: string[] = [];
    const Tabs = () => {
      tab.switchTab = new StToolDraft(null)
        .desc("Switch the tab.")
        .arg("menu", String)
        .exec((menu) => void seen.push(menu));
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Tabs />
      </AgentProvider>,
    );
    expect(surface.snapshot().tools).toHaveLength(0);
    expect(actionTagOf(tab.switchTab)).toBeUndefined();
    await tab.switchTab?.("two");
    expect(seen).toEqual(["two"]);
    unmount();
  });

  test("a name withheld and later offered publishes, and one withdrawn stops being published", async () => {
    const surface = new AgenticSurface();
    const held: { flip?: () => void; call?: (id: string) => Promise<void> } = {};
    const Row = ({ start }: { start: boolean }) => {
      const [canRemove, setCanRemove] = useState(start);
      held.flip = () => setCanRemove((value) => !value);
      held.call = new StToolDraft(canRemove ? "removeThing" : null)
        .desc("Remove the thing.")
        .arg("id", String)
        .exec(() => undefined);
      return null;
    };

    const unmountHidden = mount(
      <AgentProvider surface={surface}>
        <Row start={false} />
      </AgentProvider>,
    );
    expect(surface.snapshot().tools).toHaveLength(0);
    expect(actionTagOf(held.call)).toBeUndefined();
    act(() => held.flip?.());
    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual(["removeThing"]);
    expect(actionTagOf(held.call)?.action).toBe("removeThing");
    unmountHidden();

    const withdrawn = new AgenticSurface();
    const unmountShown = mount(
      <AgentProvider surface={withdrawn}>
        <Row start={true} />
      </AgentProvider>,
    );
    expect(withdrawn.snapshot().tools.map((tool) => tool.name)).toEqual(["removeThing"]);
    act(() => held.flip?.());
    expect(withdrawn.snapshot().tools).toHaveLength(0);
    expect(actionTagOf(held.call)).toBeUndefined();
    unmountShown();
  });

  test("opt leaves the argument out of required and hands the exec a null when it is omitted", async () => {
    const surface = new AgenticSurface();
    // The declared type is the assertion: `.arg` narrows to the value, `.opt` to the value or null.
    const held: { answer?: (reason: string, score: number | null) => Promise<void> } = {};
    const seen: unknown[][] = [];
    const Survey = () => {
      held.answer = new StToolDraft("answerSurvey")
        .desc("Answer the survey.")
        .arg("reason", String)
        .opt("score", Int)
        .exec((reason, score) => void seen.push([reason, score]));
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Survey />
      </AgentProvider>,
    );
    expect(surface.snapshot().tools[0]?.parameters).toEqual({
      type: "object",
      properties: { reason: { type: "string" }, score: { type: "integer" } },
      required: ["reason"],
      additionalProperties: false,
    });
    await surface.call("answerSurvey", { reason: "too slow" });
    await surface.call("answerSurvey", { reason: "too slow", score: 2 });
    expect(seen).toEqual([
      ["too slow", null],
      ["too slow", 2],
    ]);
    await expect(surface.call("answerSurvey", {})).rejects.toThrow('Missing argument "reason" for answerSurvey.');
    unmount();
  });

  test("a tool named for a write confirms unless it says otherwise, and the app's policy can narrow that back", () => {
    const surface = new AgenticSurface();
    const Tools = () => {
      for (const name of ["submitPost", "createPost", "updatePost", "exportCsvOfPost", "removePost", "openPost"])
        new StToolDraft(name).desc(`${name}.`).exec(() => undefined);
      new StToolDraft("sendNote", { confirm: false }).desc("sendNote.").exec(() => undefined);
      new StToolDraft("settler", { taint: "exempt" }).desc("settler.").exec(() => undefined);
      return null;
    };
    const asks = () =>
      Object.fromEntries(
        surface
          .snapshot()
          .tools.filter((tool) => tool.name !== "sendNote")
          .map((tool) => [tool.name, tool.needsConfirm] as const),
      );
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Tools />
      </AgentProvider>,
    );
    expect(asks()).toEqual({
      submitPost: true,
      createPost: true,
      updatePost: true,
      exportCsvOfPost: true,
      removePost: true,
      openPost: false,
      settler: false,
    });
    expect(ToolRunner.confirmMessage("sendNote", surface.tool("sendNote") as ToolEntry, {})).toBeNull();
    expect(surface.snapshot().tools.find((tool) => tool.name === "sendNote")?.needsConfirm).toBe(false);
    expect(ToolRunner.confirmMessage("submitPost", surface.tool("submitPost") as ToolEntry, {})).toBe(
      "Run submitPost?",
    );
    expect(surface.tool("settler")?.taint).toBe("exempt");
    unmount();
    const policy = AgentConfirm.policy;
    AgentConfirm.set({ byName: (name) => name.startsWith("remove") });
    try {
      const narrowed = mount(
        <AgentProvider surface={surface}>
          <Tools />
        </AgentProvider>,
      );
      expect(asks().submitPost).toBe(false);
      expect(asks().removePost).toBe(true);
      narrowed();
    } finally {
      AgentConfirm.set(policy);
    }
  });

  test("one name declared twice is a clash only when the two describe it differently", () => {
    const surface = new AgenticSurface();
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    const Row = ({ desc }: { desc: string }) => {
      new StToolDraft("removeTask")
        .desc(desc)
        .arg("taskId", ID)
        .exec(() => undefined);
      return null;
    };
    try {
      const unmount = mount(
        <AgentProvider surface={surface}>
          <Row desc="Remove one task." />
          <Row desc="Remove one task." />
        </AgentProvider>,
      );
      expect(warnings).toEqual([]);
      expect(surface.snapshot().tools).toHaveLength(1);
      unmount();

      const clash = mount(
        <AgentProvider surface={surface}>
          <Row desc="Remove one task." />
          <Row desc="Archive one task." />
        </AgentProvider>,
      );
      expect(warnings).toHaveLength(1);
      clash();
    } finally {
      console.warn = warn;
    }
  });
});

describe("StToolBuilder.card", () => {
  test("publishes a tool with no runnable side of its own, and hands the card its declared arguments", () => {
    const surface = new AgenticSurface();
    const drawn: unknown[] = [];
    const Widget = () => {
      new StToolDraft("collectContact")
        .desc("Ask the user for their name and phone number.")
        .arg("reason", String)
        .card((control, reason) => {
          drawn.push(reason);
          control.submit({ name: "Bora" });
          return null;
        });
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Widget />
      </AgentProvider>,
    );
    const entry = surface.tool("collectContact");
    expect(entry?.run).toBeUndefined();
    expect(surface.snapshot().tools).toEqual([
      {
        name: "collectContact",
        description: "Ask the user for their name and phone number.",
        parameters: {
          type: "object",
          properties: { reason: { type: "string" } },
          required: ["reason"],
          additionalProperties: false,
        },
        needsConfirm: false,
      },
    ]);
    const answered: unknown[] = [];
    entry?.card?.({ args: { reason: "booking" }, submit: (value) => answered.push(value), cancel: () => undefined });
    expect(drawn).toEqual(["booking"]);
    expect(answered).toEqual([{ name: "Bora" }]);
    unmount();
  });

  test("a missing or mistyped argument is refused before the card is ever drawn", () => {
    const surface = new AgenticSurface();
    let drawn = 0;
    const Widget = () => {
      new StToolDraft("schedule")
        .desc("Ask the user to pick a time.")
        .arg("startAt", Date)
        .card(() => {
          drawn += 1;
          return null;
        });
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Widget />
      </AgentProvider>,
    );
    const entry = surface.tool("schedule");
    expect(entry?.guard?.({})).toBe('Missing argument "startAt" for schedule.');
    expect(entry?.guard?.({ startAt: "not-a-date" })).toContain("ISO 8601");
    expect(entry?.guard?.({ startAt: "2026-08-19T09:00:00Z" })).toBe(true);
    expect(drawn).toBe(0);
    unmount();
  });
});
