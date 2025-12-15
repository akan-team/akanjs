"use client";
import type { ProtoFile } from "@akanjs/constant";
import type { cnst } from "@shared/client";
import { addFileUntilActive } from "@shared/next";
import { withProps } from "@udecode/cn";
import { createAlignPlugin } from "@udecode/plate-alignment";
import { createAutoformatPlugin } from "@udecode/plate-autoformat";
import {
  createBoldPlugin,
  createCodePlugin,
  createItalicPlugin,
  createStrikethroughPlugin,
  createUnderlinePlugin,
  MARK_BOLD,
  MARK_CODE,
  MARK_ITALIC,
  MARK_STRIKETHROUGH,
  MARK_UNDERLINE,
} from "@udecode/plate-basic-marks";
import { createBlockquotePlugin, ELEMENT_BLOCKQUOTE } from "@udecode/plate-block-quote";
import { createExitBreakPlugin, createSoftBreakPlugin } from "@udecode/plate-break";
import { createCaptionPlugin } from "@udecode/plate-caption";
import {
  createCodeBlockPlugin,
  ELEMENT_CODE_BLOCK,
  ELEMENT_CODE_LINE,
  ELEMENT_CODE_SYNTAX,
  isCodeBlockEmpty,
  isSelectionAtCodeBlockStart,
  unwrapCodeBlock,
} from "@udecode/plate-code-block";
import {
  createPluginFactory,
  createPlugins,
  isBlockAboveEmpty,
  isSelectionAtBlockStart,
  type PlateEditor,
  PlateLeaf,
  RenderAfterEditable,
} from "@udecode/plate-common";
import { createDndPlugin } from "@udecode/plate-dnd";
import { createExcalidrawPlugin, ELEMENT_EXCALIDRAW } from "@udecode/plate-excalidraw";
import { createFontBackgroundColorPlugin, createFontColorPlugin, createFontSizePlugin } from "@udecode/plate-font";
import {
  createHeadingPlugin,
  ELEMENT_H1,
  ELEMENT_H2,
  ELEMENT_H3,
  ELEMENT_H4,
  ELEMENT_H5,
  ELEMENT_H6,
  KEYS_HEADING,
} from "@udecode/plate-heading";
import { createIndentPlugin } from "@udecode/plate-indent";
import { createIndentListPlugin } from "@udecode/plate-indent-list";
import { createLineHeightPlugin } from "@udecode/plate-line-height";
import { createLinkPlugin, ELEMENT_LINK } from "@udecode/plate-link";
import {
  createImagePlugin,
  createMediaEmbedPlugin,
  ELEMENT_IMAGE,
  ELEMENT_MEDIA_EMBED,
  insertImage,
} from "@udecode/plate-media";
import { createNodeIdPlugin } from "@udecode/plate-node-id";
import { createParagraphPlugin, ELEMENT_PARAGRAPH } from "@udecode/plate-paragraph";
import { createResetNodePlugin } from "@udecode/plate-reset-node";
import { createDeserializeMdPlugin } from "@udecode/plate-serializer-md";
import { createTablePlugin, ELEMENT_TABLE, ELEMENT_TD, ELEMENT_TH, ELEMENT_TR } from "@udecode/plate-table";

import { autoformatPlugin } from "./autoformatPlugin";
import { BlockquoteElement } from "./BlockquoteElement";
import { CodeBlockElement } from "./CodeBlockElement";
import { CodeLeaf } from "./CodeLeaf";
import { CodeLineElement } from "./CodeLineElement";
import { CodeSyntaxLeaf } from "./CodeSyntaxLeaf";
import { ExcalidrawElement } from "./ExcalidrawElement";
import { HeadingElement } from "./HeadingElement";
import { ImageElement } from "./ImageElement";
import { LinkElement } from "./LinkElement";
import { LinkFloatingToolbar } from "./LinkFloatingToolbar";
import { MediaEmbedElement } from "./MediaEmbedElement";
import { ParagraphElement } from "./ParagraphElement";
import { withPlaceholders } from "./Placeholder";
import { TableCellElement, TableCellHeaderElement } from "./TableCellElement";
import { TableElement } from "./TableElement";
import { TableRowElement } from "./TableRowElement";
import { withDraggables } from "./withDraggables";

const resetBlockTypesCommonRule = {
  types: [
    ELEMENT_BLOCKQUOTE,
    // ELEMENT_TODO_LI
  ],
  defaultType: ELEMENT_PARAGRAPH,
};

const resetBlockTypesCodeBlockRule = {
  types: [ELEMENT_CODE_BLOCK],
  defaultType: ELEMENT_PARAGRAPH,
  onReset: unwrapCodeBlock,
};

interface InsertImagePluginProps {
  addFilesGql: (fileList: FileList, id?: string) => Promise<(cnst.File | ProtoFile)[]>;
  addFile: (file: cnst.File | cnst.File[], options?: { idx?: number; limit?: number }) => void;
}
const createInsertImagePlugin = createPluginFactory<InsertImagePluginProps>({
  key: "image-upload",
  handlers: {
    onDrop: (editor: PlateEditor) => {
      return (event) => {
        const { files } = event.dataTransfer;
        if (!files.length) return false;
        event.preventDefault();
        const { addFile, addFilesGql } = editor.pluginsByKey["image-upload"].options as InsertImagePluginProps;
        for (let i = 0; i < files.length; i++) {
          const fileData = files.item(i);
          if (!fileData) continue;
          const isImage = fileData.type.startsWith("image/");
          if (!isImage) continue;
          void addFileUntilActive(fileData, addFilesGql).then((file) => {
            insertImage(editor, file.url);
            // else insertMediaEmbed(editor, { url: file.url });
            addFile(file as cnst.File);
          });
        }
        return true;
      };
    },
    onPaste: (editor: PlateEditor) => {
      return (event) => {
        const items = Array.from(event.clipboardData.items);

        for (const item of items) {
          if (item.kind !== "file") continue;
          const fileData = item.getAsFile();
          if (!fileData) continue;
          event.preventDefault();
          const { addFile, addFilesGql } = editor.pluginsByKey["image-upload"].options as InsertImagePluginProps;
          if (item.type.startsWith("image/")) {
            void addFileUntilActive(fileData, addFilesGql).then((file) => {
              insertImage(editor, file.url);
              addFile(file as cnst.File);
            });
          }
          return true;
        }
        return false; // Allow other paste handlers
      };
    },
  },
});

export const createSlatePlugins = (props?: InsertImagePluginProps) =>
  createPlugins(
    [
      // Nodes

      createParagraphPlugin(),
      createHeadingPlugin(),
      createBlockquotePlugin(),
      createTablePlugin(),
      createCodeBlockPlugin(),
      // createHorizontalRulePlugin(),
      createLinkPlugin({
        renderAfterEditable: LinkFloatingToolbar as RenderAfterEditable,
      }),

      // Marks
      createBoldPlugin(),
      createItalicPlugin(),
      createUnderlinePlugin(),
      createStrikethroughPlugin(),
      createCodePlugin(),
      createFontColorPlugin(),
      createFontBackgroundColorPlugin(),
      createFontSizePlugin(),
      createImagePlugin(),
      createInsertImagePlugin({ options: props }),
      createMediaEmbedPlugin(),
      createDeserializeMdPlugin(),
      createCaptionPlugin({
        options: { pluginKeys: [ELEMENT_IMAGE, ELEMENT_MEDIA_EMBED] },
      }),
      createExcalidrawPlugin(),

      createAlignPlugin({
        inject: {
          props: {
            validTypes: [ELEMENT_PARAGRAPH, ELEMENT_H1, ELEMENT_H2, ELEMENT_H3, ELEMENT_H4, ELEMENT_H5, ELEMENT_H6],
          },
        },
      }),
      createIndentPlugin({
        inject: {
          props: {
            validTypes: [ELEMENT_PARAGRAPH, ELEMENT_H1, ELEMENT_H2, ELEMENT_H3, ELEMENT_BLOCKQUOTE, ELEMENT_CODE_BLOCK],
          },
        },
      }),
      createIndentListPlugin({
        inject: {
          props: {
            validTypes: [ELEMENT_PARAGRAPH, ELEMENT_H1, ELEMENT_H2, ELEMENT_H3, ELEMENT_BLOCKQUOTE, ELEMENT_CODE_BLOCK],
          },
        },
      }),
      createLineHeightPlugin({
        inject: {
          props: {
            defaultNodeValue: 1.5,
            validNodeValues: [1, 1.2, 1.5, 2, 3],
            validTypes: [ELEMENT_PARAGRAPH, ELEMENT_H1, ELEMENT_H2, ELEMENT_H3],
          },
        },
      }),
      createExitBreakPlugin({
        options: {
          rules: [
            {
              hotkey: "mod+enter",
            },
            {
              hotkey: "mod+shift+enter",
              before: true,
            },
            {
              hotkey: "enter",
              query: {
                start: true,
                end: true,
                allow: KEYS_HEADING,
              },
              relative: true,
              level: 1,
            },
          ],
        },
      }),

      createSoftBreakPlugin({
        options: {
          rules: [
            {
              hotkey: "shift+enter",
              query: {
                allow: [ELEMENT_CODE_BLOCK, ELEMENT_BLOCKQUOTE, ELEMENT_TD],
              },
            },
            {
              hotkey: "enter",
              query: {
                allow: [ELEMENT_CODE_BLOCK, ELEMENT_BLOCKQUOTE, ELEMENT_TD],
              },
            },
          ],
        },
      }),
      // Functionality
      createAutoformatPlugin(autoformatPlugin),

      createNodeIdPlugin(),
      createResetNodePlugin({
        options: {
          rules: [
            {
              ...resetBlockTypesCommonRule,
              hotkey: "Enter",
              predicate: isBlockAboveEmpty,
            },
            {
              ...resetBlockTypesCommonRule,
              hotkey: "Backspace",
              predicate: isSelectionAtBlockStart,
            },
            {
              ...resetBlockTypesCodeBlockRule,
              hotkey: "Enter",
              predicate: isCodeBlockEmpty,
            },
            {
              ...resetBlockTypesCodeBlockRule,
              hotkey: "Backspace",
              predicate: isSelectionAtCodeBlockStart,
            },
          ],
        },
      }),
      createDndPlugin({
        options: { enableScroller: true },
      }),

      // Deserialization
      createDeserializeMdPlugin(),
    ],
    {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      components: withDraggables(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        withPlaceholders({
          [ELEMENT_BLOCKQUOTE]: BlockquoteElement,
          [ELEMENT_CODE_BLOCK]: CodeBlockElement,
          [ELEMENT_CODE_LINE]: CodeLineElement,
          [ELEMENT_CODE_SYNTAX]: CodeSyntaxLeaf,
          // [ELEMENT_HR]: HrElement,
          [ELEMENT_H1]: withProps(HeadingElement, { variant: "h1" }),
          [ELEMENT_H2]: withProps(HeadingElement, { variant: "h2" }),
          [ELEMENT_H3]: withProps(HeadingElement, { variant: "h3" }),
          [ELEMENT_H4]: withProps(HeadingElement, { variant: "h4" }),
          [ELEMENT_H5]: withProps(HeadingElement, { variant: "h5" }),
          [ELEMENT_H6]: withProps(HeadingElement, { variant: "h6" }),
          [ELEMENT_IMAGE]: ImageElement,
          // [ELEMENT_LI]: withProps(PlateElement, { as: "li" }),
          [ELEMENT_LINK]: LinkElement,
          [ELEMENT_MEDIA_EMBED]: MediaEmbedElement,
          // [ELEMENT_MENTION]: MentionElement,
          // [ELEMENT_MENTION_INPUT]: MentionInputElement,
          // [ELEMENT_UL]: withProps(ListElement, { variant: "ul" }),
          // [ELEMENT_OL]: withProps(ListElement, { variant: "ol" }),
          [ELEMENT_PARAGRAPH]: ParagraphElement,
          [ELEMENT_TABLE]: TableElement,
          [ELEMENT_TD]: TableCellElement,
          [ELEMENT_TH]: TableCellHeaderElement,
          [ELEMENT_TR]: TableRowElement,
          // [ELEMENT_TODO_LI]: TodoListElement,
          // [ELEMENT_TR]: TableRowElement,
          [ELEMENT_EXCALIDRAW]: ExcalidrawElement,
          [MARK_BOLD]: withProps(PlateLeaf, { as: "strong" }),
          [MARK_CODE]: CodeLeaf,
          // [MARK_HIGHLIGHT]: HighlightLeaf,
          [MARK_ITALIC]: withProps(PlateLeaf, { as: "em" }),
          // [MARK_KBD]: KbdLeaf,
          [MARK_STRIKETHROUGH]: withProps(PlateLeaf, { as: "s" }),
          // [MARK_SUBSCRIPT]: withProps(PlateLeaf, { as: "sub" }),
          // [MARK_SUPERSCRIPT]: withProps(PlateLeaf, { as: "sup" }),
          [MARK_UNDERLINE]: withProps(PlateLeaf, { as: "u" }),
          // [MARK_COMMENT]: CommentLeaf,
        })
      ),
    }
  );
