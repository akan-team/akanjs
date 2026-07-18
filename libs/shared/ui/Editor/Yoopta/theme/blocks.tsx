"use client";
import { Elements, type PluginElementRenderProps, useBlockData, useYooptaEditor } from "@yoopta/editor";
import { useNumberListCount } from "@yoopta/lists";
// Heavy blocks reuse the shadcn render components (faithful look). Importing the
// package also triggers its CSS injection, which our `bun patch` wraps in
// `@layer yoopta` so it stays below the app's utilities (see app styles.css).
import { AccordionUI, CodeUI, FileUI, TableUI, VideoUI } from "@yoopta/themes-shadcn";
import { clsx } from "akanjs/client";
import type { ReactElement } from "react";
import { BiCheck } from "react-icons/bi";

type Render = (props: PluginElementRenderProps) => ReactElement;
type Elementsmap = Record<string, { render: Render }>;

const Paragraph: Render = ({ attributes, children }) => (
  <p {...attributes} className="mt-2 leading-7">
    {children}
  </p>
);

const HeadingOne: Render = ({ attributes, children, element }) => (
  <h1
    id={element.id}
    draggable={false}
    {...attributes}
    className="mt-8 scroll-m-20 font-extrabold text-4xl tracking-tight lg:text-5xl"
  >
    {children}
  </h1>
);

const HeadingTwo: Render = ({ attributes, children, element }) => (
  <h2
    id={element.id}
    draggable={false}
    {...attributes}
    className="mt-6 scroll-m-20 font-semibold text-3xl tracking-tight transition-colors"
  >
    {children}
  </h2>
);

const HeadingThree: Render = ({ attributes, children, element }) => (
  <h3
    id={element.id}
    draggable={false}
    {...attributes}
    className="mt-4 scroll-m-20 font-semibold text-2xl tracking-tight"
  >
    {children}
  </h3>
);

const Blockquote: Render = ({ attributes, children }) => (
  <blockquote {...attributes} className="mt-4 border-base-300 border-l-2 pl-6 leading-7">
    {children}
  </blockquote>
);

const BulletedList: Render = ({ attributes, children }) => (
  <ul {...attributes} className="my-0 ml-6 list-disc leading-7">
    <li className="pl-2">{children}</li>
  </ul>
);

const NumberedList: Render = ({ attributes, children, blockId }) => {
  const blockData = useBlockData(blockId);
  const count = useNumberListCount(blockData);
  return (
    <div {...attributes} className="my-0 mt-2 ml-6 leading-7">
      <span contentEditable={false}>{count}.</span>
      <span className="pl-2">{children}</span>
    </div>
  );
};

const TodoList: Render = ({ attributes, children, element, blockId }) => {
  const editor = useYooptaEditor();
  const checked = !!(element.props as { checked?: boolean } | undefined)?.checked;
  return (
    <div {...attributes} className="m-0 mt-2 ml-6 list-none leading-7">
      <div className="flex items-start gap-2 pl-2">
        <button
          type="button"
          contentEditable={false}
          aria-label={checked ? "Mark as unchecked" : "Mark as checked"}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            Elements.updateElement(editor, { blockId, type: "todo-list", props: { checked: !checked } });
          }}
          className={clsx(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border-2 transition-colors",
            checked ? "border-primary bg-primary text-primary-content" : "border-base-300 bg-base-100",
          )}
        >
          {checked ? <BiCheck className="h-3 w-3" /> : null}
        </button>
        <span className={clsx("flex-1", checked && "text-base-content/60 line-through")}>{children}</span>
      </div>
    </div>
  );
};

const CALLOUT_VARIANTS: Record<string, string> = {
  default: "bg-base-200 text-base-content/70 border-base-content/20",
  info: "bg-blue-50 text-blue-900 border-blue-200 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100",
  success: "bg-green-50 text-green-900 border-green-200 dark:border-green-800 dark:bg-green-950 dark:text-green-100",
  warning:
    "bg-yellow-50 text-yellow-900 border-yellow-200 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-100",
  error: "bg-red-50 text-red-900 border-red-200 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
};

const Callout: Render = ({ attributes, children, element }) => {
  const theme = (element.props as { theme?: string } | undefined)?.theme ?? "default";
  return (
    <div
      {...attributes}
      className={clsx(
        "mt-4 rounded-lg border-l-4 p-4 [&>p]:m-0 [&>p]:text-sm",
        CALLOUT_VARIANTS[theme] ?? CALLOUT_VARIANTS.default,
      )}
    >
      {children}
    </div>
  );
};

const Divider: Render = ({ attributes, children }) => (
  <div {...attributes} contentEditable={false} className="w-full py-3">
    <hr className="border-base-300" />
    {children}
  </div>
);

const Link: Render = ({ attributes, children, element }) => {
  const props = element.props as { url?: string; target?: string; rel?: string; title?: string } | undefined;
  return (
    <a
      {...attributes}
      href={props?.url || undefined}
      target={props?.target}
      rel={props?.rel}
      title={props?.title || undefined}
      className="font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
    >
      {children}
    </a>
  );
};

/** Render maps keyed by Yoopta plugin type, mirroring @yoopta/themes-shadcn's applyTheme shape. */
export const akanElements: Record<string, Elementsmap> = {
  Paragraph: { paragraph: { render: Paragraph } },
  HeadingOne: { "heading-one": { render: HeadingOne } },
  HeadingTwo: { "heading-two": { render: HeadingTwo } },
  HeadingThree: { "heading-three": { render: HeadingThree } },
  Blockquote: { blockquote: { render: Blockquote } },
  Callout: { callout: { render: Callout } },
  BulletedList: { "bulleted-list": { render: BulletedList } },
  NumberedList: { "numbered-list": { render: NumberedList } },
  TodoList: { "todo-list": { render: TodoList } },
  Divider: { divider: { render: Divider } },
  Link: { link: { render: Link } },
  // Heavy blocks: keep the shadcn render components for faithful appearance.
  Code: CodeUI as unknown as Elementsmap,
  Table: TableUI as unknown as Elementsmap,
  Accordion: AccordionUI as unknown as Elementsmap,
  File: FileUI as unknown as Elementsmap,
  Video: VideoUI as unknown as Elementsmap,
};
