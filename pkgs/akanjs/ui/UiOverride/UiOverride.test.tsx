import { describe, expect, test } from "bun:test";
import { type ComponentType, createElement, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";

import type { ButtonProps } from "../Button";
import type { AkanModalComponent, AkanUiOverrides, AkanUiRecipes } from "./context";
import { createOverridable } from "./createOverridable";
import { override } from "./override";
import { UiOverrideProvider } from "./Provider";
import { useUiOverride } from "./useUiOverride";
import { useUiRecipe } from "./useUiRecipe";

// The shipped `../Modal` transitively loads the store, which reads these at import time. Default them so this
// test is self-contained (it never imports `../Modal` statically — see the dynamic import below).
process.env.AKAN_PUBLIC_APP_NAME ??= "test";
process.env.AKAN_PUBLIC_REPO_NAME ??= "akanjs";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "akanjs.com";
process.env.AKAN_PUBLIC_OPERATION_MODE ??= "local";

async function renderToText(node: ReactNode): Promise<string> {
  return new Response(await renderToReadableStream(node)).text();
}

const DefaultTestModal: AkanModalComponent = ({ title }) => <div data-skin="default">{title}</div>;
const BrandModal: AkanModalComponent = ({ title }) => <div data-skin="brand">{title}</div>;
const InnerModal: AkanModalComponent = ({ title }) => <div data-skin="inner">{title}</div>;

// Uses the real "Modal" override slot, exactly like the shipped `Modal` proxy.
const Widget = createOverridable("Modal", DefaultTestModal);

describe("UiOverride", () => {
  test("falls back to the default when no _overrides is active", async () => {
    const html = await renderToText(<Widget open onCancel={() => {}} title="HELLO" />);
    expect(html).toContain('data-skin="default"');
    expect(html).toContain("HELLO");
  });

  test("swaps to the override supplied by the provider", async () => {
    const html = await renderToText(
      <UiOverrideProvider value={{ Modal: BrandModal }}>
        <Widget open onCancel={() => {}} title="HELLO" />
      </UiOverrideProvider>,
    );
    expect(html).toContain('data-skin="brand"');
    expect(html).not.toContain('data-skin="default"');
    expect(html).toContain("HELLO");
  });

  test("inherits an ancestor override through an empty nested provider", async () => {
    const html = await renderToText(
      <UiOverrideProvider value={{ Modal: BrandModal }}>
        <UiOverrideProvider>
          <Widget open onCancel={() => {}} title="HELLO" />
        </UiOverrideProvider>
      </UiOverrideProvider>,
    );
    expect(html).toContain('data-skin="brand"');
  });

  test("closest nested override wins (child scope beats parent scope)", async () => {
    const html = await renderToText(
      <UiOverrideProvider value={{ Modal: BrandModal }}>
        <UiOverrideProvider value={{ Modal: InnerModal }}>
          <Widget open onCancel={() => {}} title="HELLO" />
        </UiOverrideProvider>
      </UiOverrideProvider>,
    );
    expect(html).toContain('data-skin="inner"');
    expect(html).not.toContain('data-skin="brand"');
  });

  test("the shipped Modal export routes through the override", async () => {
    // Imported dynamically so its store-loading dependency chain runs after the env defaults above are set.
    const { Modal } = await import("../Modal");
    const html = await renderToText(
      <UiOverrideProvider value={{ Modal: BrandModal }}>
        <Modal open onCancel={() => {}} title="REAL" />
      </UiOverrideProvider>,
    );
    expect(html).toContain('data-skin="brand"');
    expect(html).toContain("REAL");
  });

  test("override() returns the slot map used as the provider value", async () => {
    const manifest = override({ Modal: BrandModal });
    expect(manifest).toEqual({ Modal: BrandModal });
    const html = await renderToText(
      <UiOverrideProvider value={manifest}>
        <Widget open onCancel={() => {}} title="HELLO" />
      </UiOverrideProvider>,
    );
    expect(html).toContain('data-skin="brand"');
  });

  test("resolves a non-Modal slot (Empty) through the same proxy machinery", async () => {
    const DefaultEmpty: AkanUiOverrides["Empty"] = ({ description }) => (
      <div data-slot="default-empty">{description}</div>
    );
    const BrandEmpty: AkanUiOverrides["Empty"] = ({ description }) => <div data-slot="brand-empty">{description}</div>;
    const EmptyWidget = createOverridable("Empty", DefaultEmpty);

    const fallback = await renderToText(<EmptyWidget description="NONE" />);
    expect(fallback).toContain('data-slot="default-empty"');

    const overridden = await renderToText(
      <UiOverrideProvider value={{ Empty: BrandEmpty }}>
        <EmptyWidget description="NONE" />
      </UiOverrideProvider>,
    );
    expect(overridden).toContain('data-slot="brand-empty"');
    expect(overridden).not.toContain('data-slot="default-empty"');
  });

  test("override() carries multiple slots in one manifest", async () => {
    const BrandEmpty: AkanUiOverrides["Empty"] = ({ description }) => <div data-slot="brand-empty">{description}</div>;
    const EmptyWidget = createOverridable("Empty", (({ description }) => (
      <div data-slot="default-empty">{description}</div>
    )) as AkanUiOverrides["Empty"]);
    const manifest = override({ Modal: BrandModal, Empty: BrandEmpty });
    expect(Object.keys(manifest).sort()).toEqual(["Empty", "Modal"]);

    const html = await renderToText(
      <UiOverrideProvider value={manifest}>
        <Widget open onCancel={() => {}} title="HELLO" />
        <EmptyWidget description="NONE" />
      </UiOverrideProvider>,
    );
    expect(html).toContain('data-skin="brand"');
    expect(html).toContain('data-slot="brand-empty"');
  });

  test("generic slot preserves call-site typing while resolving overrides (Button pattern)", async () => {
    const DefaultLocalButton: AkanUiOverrides["Button"] = ({ children }) => (
      <button type="button" data-skin="default-btn">
        {children}
      </button>
    );
    const BrandButton: AkanUiOverrides["Button"] = ({ children }) => (
      <button type="button" data-skin="brand-btn">
        {children}
      </button>
    );
    // Mirrors the shipped Button: the public signature stays generic; resolution goes through the erased slot.
    const LocalButton = <Result = unknown>(props: ButtonProps<Result>) => {
      const Override = useUiOverride("Button");
      return createElement((Override ?? DefaultLocalButton) as unknown as ComponentType<ButtonProps<Result>>, props);
    };

    const fallback = await renderToText(<LocalButton onClick={() => {}}>HELLO</LocalButton>);
    expect(fallback).toContain('data-skin="default-btn"');

    const overridden = await renderToText(
      <UiOverrideProvider value={{ Button: BrandButton }}>
        {/* Explicit type argument proves `Result` inference survives the wrapper. */}
        <LocalButton<number>
          onClick={() => 5}
          onSuccess={(r: number) => {
            void r;
          }}
        >
          HELLO
        </LocalButton>
      </UiOverrideProvider>,
    );
    expect(overridden).toContain('data-skin="brand-btn"');
    expect(overridden).not.toContain('data-skin="default-btn"');
  });

  test("recipe slot: falls back to the framework recipe when no swap is active", async () => {
    const { buttonRecipe } = await import("../recipe");
    // Mirrors the shipped Button's resolution line: useUiRecipe("button") ?? buttonRecipe.
    const RecipeWidget = ({ variant }: { variant?: "primary" | "ghost" }) => {
      const recipe = useUiRecipe("button") ?? buttonRecipe;
      return <button type="button" data-cls={recipe({ variant })} />;
    };
    const html = await renderToText(<RecipeWidget variant="primary" />);
    expect(html).toContain("bg-primary");
  });

  test("recipe slot: swaps the look app-wide while the consumer stays unchanged", async () => {
    const { buttonRecipe } = await import("../recipe");
    const neon: AkanUiRecipes["button"] = (variants, className) =>
      ["neon", variants?.variant ?? "primary", className].filter(Boolean).join(" ");
    const RecipeWidget = ({ variant }: { variant?: "primary" | "ghost" }) => {
      const recipe = useUiRecipe("button") ?? buttonRecipe;
      return <button type="button" data-cls={recipe({ variant }, "w-full")} />;
    };
    const html = await renderToText(
      <UiOverrideProvider value={{ recipes: { button: neon } }}>
        <RecipeWidget variant="ghost" />
      </UiOverrideProvider>,
    );
    expect(html).toContain("neon ghost w-full");
    expect(html).not.toContain("bg-primary");
  });

  test("recipe slot: input swap reaches the shared field shell resolution line", async () => {
    const { inputRecipe } = await import("../recipe");
    const brandInput: AkanUiRecipes["input"] = (variants, className) =>
      ["brand-input", variants?.kind ?? "field", className].filter(Boolean).join(" ");
    // Mirrors the shipped Input/TextArea resolution line: (useUiRecipe("input") ?? inputRecipe)(...).
    const FieldShell = () => {
      const inputBase = (useUiRecipe("input") ?? inputRecipe)({ kind: "area" });
      return <textarea data-cls={inputBase} />;
    };
    const html = await renderToText(
      <UiOverrideProvider value={{ recipes: { input: brandInput } }}>
        <FieldShell />
      </UiOverrideProvider>,
    );
    expect(html).toContain("brand-input area");
    const fallback = await renderToText(<FieldShell />);
    expect(fallback).toContain("p-3");
  });

  test("recipe slots merge per-slot down the tree (child button swap keeps parent badge swap)", async () => {
    const parentBadge: AkanUiRecipes["badge"] = () => "parent-badge";
    const childButton: AkanUiRecipes["button"] = () => "child-button";
    const Probe = () => {
      const button = useUiRecipe("button");
      const badge = useUiRecipe("badge");
      return <div data-btn={button?.()} data-bdg={badge?.()} />;
    };
    const html = await renderToText(
      <UiOverrideProvider value={{ recipes: { badge: parentBadge } }}>
        <UiOverrideProvider value={{ recipes: { button: childButton } }}>
          <Probe />
        </UiOverrideProvider>
      </UiOverrideProvider>,
    );
    expect(html).toContain('data-btn="child-button"');
    expect(html).toContain('data-bdg="parent-badge"');
  });

  test("one manifest carries component slots and recipe slots together", async () => {
    const neon: AkanUiRecipes["button"] = () => "neon";
    const manifest = override({ Modal: BrandModal, recipes: { button: neon } });
    const Probe = () => {
      const button = useUiRecipe("button");
      return <div data-btn={button?.()} />;
    };
    const html = await renderToText(
      <UiOverrideProvider value={manifest}>
        <Widget open onCancel={() => {}} title="HELLO" />
        <Probe />
      </UiOverrideProvider>,
    );
    expect(html).toContain('data-skin="brand"');
    expect(html).toContain('data-btn="neon"');
  });

  test("the SHIPPED Button routes its recipe through the override slot (real wiring, not a mirror)", async () => {
    // Register a minimal client runtime so the real Button's usePage() resolves. State lives on
    // globalThis, so this stub is shared with the runtime Button reads through "akanjs/client".
    const { registerClientRuntime } = await import("../../client/clientRuntime");
    registerClientRuntime({ usePage: () => ({ l: (key: string) => key }) } as never, { scope: "app" });
    const { Button } = await import("../Button");
    const neon: AkanUiRecipes["button"] = (variants, className) =>
      ["neon", variants?.variant ?? "primary", className].filter(Boolean).join(" ");

    // No override → the real Button renders with the framework recipe.
    const def = await renderToText(<Button onClick={() => {}}>GO</Button>);
    expect(def).toContain("bg-primary");

    // With a recipe swap in the subtree → the SAME <Button> renders the swapped recipe, unchanged call site.
    const swapped = await renderToText(
      <UiOverrideProvider value={{ recipes: { button: neon } }}>
        <Button variant="ghost" onClick={() => {}}>
          GO
        </Button>
      </UiOverrideProvider>,
    );
    expect(swapped).toContain("neon ghost");
    expect(swapped).not.toContain("bg-primary");
  });

  test("compound leaf slots resolve independently (RadioItem)", async () => {
    const DefaultRadioItem: AkanUiOverrides["RadioItem"] = ({ children }) => (
      <div data-slot="default-item">{children}</div>
    );
    const BrandRadioItem: AkanUiOverrides["RadioItem"] = ({ children }) => <div data-slot="brand-item">{children}</div>;
    const ItemWidget = createOverridable("RadioItem", DefaultRadioItem);

    const fallback = await renderToText(<ItemWidget value="x">ITEM</ItemWidget>);
    expect(fallback).toContain('data-slot="default-item"');

    const overridden = await renderToText(
      <UiOverrideProvider value={{ RadioItem: BrandRadioItem }}>
        <ItemWidget value="x">ITEM</ItemWidget>
      </UiOverrideProvider>,
    );
    expect(overridden).toContain('data-slot="brand-item"');
    expect(overridden).not.toContain('data-slot="default-item"');
  });
});
