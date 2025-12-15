"use client";
// import { ActionMenuList } from "./ActionMenuList";
import { JSON } from "@akanjs/base";
import { clsx } from "@akanjs/client";
import { ProtoFile } from "@akanjs/constant";
import { cnst } from "@shared/client";
import { addFileUntilActive } from "@shared/next";
import Accordion from "@yoopta/accordion";
import ActionMenuList, { DefaultActionMenuRender } from "@yoopta/action-menu-list";
import Blockquote from "@yoopta/blockquote";
import Callout from "@yoopta/callout";
import Code from "@yoopta/code";
import Divider from "@yoopta/divider";
import YooptaEditor, {
  createYooptaEditor,
  DeleteBlockOperation,
  SlateElement,
  Tools,
  YooptaBlockData,
  YooptaContentValue,
  YooptaEventChangePayload,
  YooptaPlugin,
} from "@yoopta/editor";
import Embed from "@yoopta/embed";
import File from "@yoopta/file";
import { HeadingOne, HeadingThree, HeadingTwo } from "@yoopta/headings";
import Image from "@yoopta/image";
import Link from "@yoopta/link";
import LinkTool, { DefaultLinkToolRender } from "@yoopta/link-tool";
import { BulletedList, NumberedList, TodoList } from "@yoopta/lists";
import { Bold, CodeMark, Highlight, Italic, Strike, Underline } from "@yoopta/marks";
import Paragraph from "@yoopta/paragraph";
import Table from "@yoopta/table";
import Toolbar, { DefaultToolbarRender } from "@yoopta/toolbar";
import Video from "@yoopta/video";
import { useTheme } from "next-themes";
// import { enableES5 } from "immer"; // 버전업되면서 없어짐
import { useEffect, useMemo, useState } from "react";

const defaultPlugins = [
  Paragraph,
  Table,
  Divider,
  Accordion,
  HeadingOne,
  HeadingTwo,
  HeadingThree,
  Blockquote,
  Callout,
  NumberedList,
  BulletedList,
  TodoList,
  Code,
  Link,
  Embed,
];

const TOOLS: Tools = {
  ActionMenu: {
    tool: ActionMenuList,
    render: DefaultActionMenuRender,
  },
  Toolbar: {
    render: DefaultToolbarRender,
    tool: Toolbar,
  },
  LinkTool: {
    render: DefaultLinkToolRender,
    tool: LinkTool,
  },
};

const MARKS = [Bold, Italic, CodeMark, Underline, Strike, Highlight];

interface YooptaProps {
  defaultReadOnly?: boolean;
  className?: string;
  addFilesGql?: (fileList: FileList, id?: string) => Promise<(cnst.File | ProtoFile)[]>;
  addFile?: (
    file: cnst.File | cnst.File[],
    options?: { idx?: number; limit?: number }
  ) => Promise<cnst.File | cnst.File[]>;
  onChange: (value: JSON) => void;
  onDelete?: (blocks: YooptaBlockData<SlateElement>[]) => void;
  value: any;
  height?: string;
  placeholder?: string;
  disabled?: boolean;
  debug?: boolean;
  plugins?: YooptaPlugin<Record<string, SlateElement>>[];
}

const Yoopta = ({
  defaultReadOnly = false,
  className,
  onChange,
  onDelete,
  value,
  addFile,
  addFilesGql,
  plugins,
}: YooptaProps) => {
  const [readOnly, setReadOnly] = useState(defaultReadOnly);
  const { theme, systemTheme } = useTheme();
  const editor = useMemo(() => createYooptaEditor(), []);

  const handleChange = (payload: YooptaEventChangePayload) => {
    onChange(payload.value as unknown as JSON);
    if (onDelete) {
      const deleteBlocks = payload.operations.filter((operation) => operation.type === "delete_block");
      if (deleteBlocks.length > 0)
        onDelete(
          deleteBlocks.map(
            (operation: DeleteBlockOperation) => operation.block as unknown as YooptaBlockData<SlateElement>
          )
        );
    }
  };

  useEffect(() => {
    editor.on("change", handleChange);
    return () => {
      editor.off("change", handleChange);
    };
  }, [editor]);

  return (
    <>
      <YooptaEditor
        className={clsx(
          "[&_.yoo-embed-items-center]:!text-black [&_.yoo-image-font-medium]:!text-gray-500 [&_.yoo-toolbar-text-xs]:text-black [&_.yoo-video-font-medium]:!text-gray-500 [&_.yoopta-action-root]:text-black [&_.yoopta-block-options-button]:text-black [&_.yoopta-button]:text-black [&_.yoopta-mark-code]:text-black [&_.yoopta-toolbar-root]:bg-white [&_.yoopta-toolbar-root]:text-black [&_.yoopta-toolbar-root]:shadow-md [&_.yoopta-toolbar-text-xs]:text-black",
          className,
          {
            "[&_.yoopta-block-actions_button]:!text-white":
              theme === "dark" || (theme === "system" && systemTheme === "dark"),
            "[&_.yoo-file-font-normal]:!text-gray-400":
              theme === "dark" || (theme === "system" && systemTheme === "dark"),
          }
        )}
        readOnly={readOnly}
        value={value as unknown as YooptaContentValue}
        style={{ width: "100%" }}
        editor={editor}
        tools={readOnly ? {} : TOOLS}
        marks={readOnly ? [] : MARKS}
        plugins={
          [
            ...(plugins ?? []),
            ...defaultPlugins,
            ...(addFilesGql
              ? [
                  Image.extend({
                    options: {
                      async onUpload(fileData) {
                        const file = await addFileUntilActive(fileData, addFilesGql);
                        const [width, height] = file.imageSize;
                        return { src: file.url, alt: "cloudinary", sizes: { width, height } };
                      },
                    },
                  }),
                  Video.extend({
                    options: {
                      onUpload: async (fileData) => {
                        const file = await addFileUntilActive(fileData, addFilesGql);
                        const [width, height] = file.imageSize;
                        return { src: file.url, alt: "cloudinary", sizes: { width, height } };
                      },
                      onUploadPoster: async (file) => {
                        const data = await addFilesGql([file] as unknown as FileList);
                        return data[0].url;
                      },
                    },
                  }),
                  File.extend({
                    options: {
                      onUpload: async (fileData) => {
                        const file = await addFileUntilActive(fileData, addFilesGql);
                        const [width, height] = file.imageSize;
                        return { src: file.url, alt: "cloudinary", sizes: { width, height } };
                      },
                    },
                  }),
                ]
              : []),
          ] as unknown as YooptaPlugin<Record<string, SlateElement>>[]
        }
        placeholder="Type something"
      />
      {/* </div> */}
    </>
  );
};

interface EditorProps {
  readOnly?: boolean;
  className?: string;
  value: object;
  onChange: (slate: any) => void;
  onDelete?: (blocks: YooptaBlockData<SlateElement>[]) => void;
  addFilesGql?: (fileList: FileList, id?: string) => Promise<(cnst.File | ProtoFile)[]>;
  addFile?: (
    file: cnst.File | cnst.File[],
    options?: { idx?: number; limit?: number }
  ) => Promise<cnst.File | cnst.File[]>;
  defaultValue?: string;
  height?: string;
  placeholder?: string;
  disabled?: boolean;
  debug?: boolean;
  plugins?: YooptaPlugin<Record<string, SlateElement>>[];
}

export default function Editor({
  readOnly = false,
  className,
  value,
  onChange,
  onDelete,
  addFilesGql,
  addFile,
  plugins,
}: EditorProps) {
  // useEffect(() => {
  //   enableES5();
  // }, []);
  return (
    <Yoopta
      value={value}
      defaultReadOnly={readOnly}
      className={className}
      addFilesGql={addFilesGql}
      addFile={addFile}
      onChange={onChange}
      onDelete={onDelete}
      plugins={plugins}
    />
  );
}
