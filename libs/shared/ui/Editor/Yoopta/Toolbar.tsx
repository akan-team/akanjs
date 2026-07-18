"use client";

import { useYooptaEditor } from "@yoopta/editor";
import { LinkCommands } from "@yoopta/link";
import { FloatingToolbar } from "@yoopta/ui";
import { clsx } from "akanjs/client";

import { safeExternalUrl } from "./Upload";

const MARKS = [
  { type: "bold", label: "B" },
  { type: "italic", label: "I" },
  { type: "underline", label: "U" },
  { type: "strike", label: "S" },
  { type: "code", label: "<>" },
] as const;

export const Toolbar = () => {
  const editor = useYooptaEditor();

  const insertLink = () => {
    const url = window.prompt("URL");
    if (!url) return;

    const safeUrl = safeExternalUrl(url);
    if (!safeUrl) {
      window.alert("Only http and https links are allowed.");
      return;
    }

    const block = editor.getBlock({ at: editor.path.current });
    const slate = block ? editor.blockEditorsMap[block.id] : null;
    if (!slate?.selection) return;

    LinkCommands.insertLink(editor, {
      slate,
      props: {
        url: safeUrl,
        target: "_blank",
        rel: "noopener noreferrer",
        title: safeUrl,
      },
    });
  };

  return (
    <FloatingToolbar>
      <FloatingToolbar.Content className="z-50 flex items-center gap-1 rounded-md border border-base-content/10 bg-base-100 p-1 shadow-lg">
        <FloatingToolbar.Group className="flex items-center gap-1">
          {MARKS.map((mark) => {
            const format = editor.formats[mark.type];
            return (
              <FloatingToolbar.Button
                key={mark.type}
                className={clsx("btn btn-xs btn-ghost min-h-7 px-2", { "btn-active": format?.isActive() })}
                type="button"
                active={format?.isActive()}
                onClick={() => format?.toggle()}
              >
                {mark.label}
              </FloatingToolbar.Button>
            );
          })}
        </FloatingToolbar.Group>
        <FloatingToolbar.Separator className="mx-1 h-5 w-px bg-base-content/20" />
        <FloatingToolbar.Group className="flex items-center gap-1">
          <FloatingToolbar.Button className="btn btn-xs btn-ghost min-h-7 px-2" type="button" onClick={insertLink}>
            Link
          </FloatingToolbar.Button>
        </FloatingToolbar.Group>
      </FloatingToolbar.Content>
    </FloatingToolbar>
  );
};
