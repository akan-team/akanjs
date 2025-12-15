"use client";
import { clsx } from "@akanjs/client";
import type { ProtoFile } from "@akanjs/constant";
import { cnst, fetch, usePage } from "@shared/client";
import { useAlignDropdownMenu, useAlignDropdownMenuState } from "@udecode/plate-alignment";
import { MARK_BOLD, MARK_CODE, MARK_ITALIC, MARK_STRIKETHROUGH, MARK_UNDERLINE } from "@udecode/plate-basic-marks";
import { ELEMENT_BLOCKQUOTE } from "@udecode/plate-block-quote";
import { insertEmptyCodeBlock } from "@udecode/plate-code-block";
import {
  collapseSelection,
  ELEMENT_DEFAULT,
  findNode,
  focusEditor,
  insertEmptyElement,
  isBlock,
  isCollapsed,
  someNode,
  TElement,
  toggleNodeType,
  useEditorRef,
  useEditorSelector,
  useMarkToolbarButton,
  useMarkToolbarButtonState,
} from "@udecode/plate-common";
import { insertExcalidraw } from "@udecode/plate-excalidraw";
import { MARK_BG_COLOR, MARK_COLOR, useColorDropdownMenu, useColorDropdownMenuState } from "@udecode/plate-font";
import { ELEMENT_H1, ELEMENT_H2, ELEMENT_H3 } from "@udecode/plate-heading";
import { useIndentButton, useOutdentButton } from "@udecode/plate-indent";
import { ListStyleType, useIndentListToolbarButton, useIndentListToolbarButtonState } from "@udecode/plate-indent-list";
import { useLineHeightDropdownMenu, useLineHeightDropdownMenuState } from "@udecode/plate-line-height";
import { useLinkToolbarButton, useLinkToolbarButtonState } from "@udecode/plate-link";
import { ELEMENT_IMAGE, ELEMENT_MEDIA_EMBED, insertImage, useMediaToolbarButton } from "@udecode/plate-media";
import { ELEMENT_PARAGRAPH } from "@udecode/plate-paragraph";
import {
  deleteColumn,
  deleteRow,
  deleteTable,
  ELEMENT_TABLE,
  insertTable,
  insertTableColumn,
  insertTableRow,
} from "@udecode/plate-table";
import { type ChangeEvent, ReactNode, useState } from "react";
import { AiOutlineLineHeight } from "react-icons/ai";
import {
  BiAlignJustify,
  BiAlignLeft,
  BiAlignMiddle,
  BiAlignRight,
  BiBold,
  BiChevronDown,
  BiCodeAlt,
  BiCodeBlock,
  BiColorFill,
  BiFontColor,
  BiImage,
  BiItalic,
  BiLeftIndent,
  BiLinkAlt,
  BiListOl,
  BiListUl,
  BiMinus,
  BiParagraph,
  BiPen,
  BiPlus,
  BiRightIndent,
  BiSolidQuoteRight,
  BiSolidVideos,
  BiStrikethrough,
  BiTable,
  BiTrashAlt,
  BiUnderline,
  BiX,
} from "react-icons/bi";

import { DEFAULT_COLORS, DEFAULT_CUSTOM_COLORS } from "./colorConstants";
// import { serializeHtml } from "@udecode/plate-serializer-html";

interface ToolbarProps {
  addFilesGql: (fileList: FileList, id?: string) => Promise<(cnst.File | ProtoFile)[]>;
  addFile: (file: cnst.File | cnst.File[], options?: { idx?: number; limit?: number }) => void;
}

export const Toolbar = ({ addFilesGql, addFile }: ToolbarProps) => {
  const { l } = usePage();

  return (
    <div className="flex w-full flex-wrap gap-2 border-b border-black/20 px-2 py-1">
      <InsertDropdownMenu />
      <TurnIntoDropdownMenu />
      <Separator />
      <MarkToolbarButton nodeType={MARK_BOLD} tooltip={l("shared.editor-bold")}>
        <BiBold />
      </MarkToolbarButton>
      <MarkToolbarButton nodeType={MARK_ITALIC} tooltip={l("shared.editor-italic")}>
        <BiItalic />
      </MarkToolbarButton>
      <MarkToolbarButton nodeType={MARK_UNDERLINE} tooltip={l("shared.editor-underline")}>
        <BiUnderline />
      </MarkToolbarButton>
      <MarkToolbarButton nodeType={MARK_STRIKETHROUGH} tooltip={l("shared.editor-strike")}>
        <BiStrikethrough />
      </MarkToolbarButton>
      <MarkToolbarButton nodeType={MARK_CODE} tooltip={l("shared.editor-code")}>
        <BiCodeAlt />
      </MarkToolbarButton>
      <CodeBlockButton />
      <ColorDropdownMenu nodeType={MARK_COLOR} tooltip={l("shared.editor-textColor")}>
        <BiFontColor />
      </ColorDropdownMenu>
      <ColorDropdownMenu nodeType={MARK_BG_COLOR} tooltip={l("shared.editor-bgColor")}>
        <BiColorFill />
      </ColorDropdownMenu>
      <Separator />
      <AlignDropdownMenu />
      <LineHeightDropdownMenu />
      <IndentListToolbarButton nodeType={ListStyleType.Disc} />
      <IndentListToolbarButton nodeType={ListStyleType.Decimal} />
      <IndentToolbarButton />
      <OutdentToolbarButton />
      <Separator />
      <LinkToolbarButton />
      <ImageToolbarButton addFile={addFile} addFilesGql={addFilesGql} />
      <MediaToolbarButton tooltip={l("shared.editor-embed")} nodeType={ELEMENT_MEDIA_EMBED}>
        <BiSolidVideos />
      </MediaToolbarButton>
      <ExcalidrawButton />
      <TableDropdownMenu />
    </div>
  );
};

const Separator = () => {
  return <div className="h-8 w-px bg-black/20 "> </div>;
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  isActive?: boolean;
  tooltip?: string;
}

const Button = ({ children, isActive, tooltip, ...props }: ButtonProps) => {
  const ButtonWrapper = ({ children }) =>
    tooltip ? (
      <div className="tooltip tooltip-primary" data-tip={tooltip}>
        {children}
      </div>
    ) : (
      <>{children}</>
    );

  return (
    <ButtonWrapper>
      <button
        {...props}
        className={`btn btn-sm btn-ghost text-lg transition duration-300 hover:bg-black/10 ${
          isActive ? "text-primary font-semibold opacity-100" : "opacity-60"
        } ${props.className}`}
      >
        {children}
      </button>
    </ButtonWrapper>
  );
};

const Dropdown = ({
  value,
  tooltip,
  contents,
  renderContent,
  className,
}: {
  value: React.ReactNode;
  tooltip: string;
  contents?: React.ReactNode[];
  renderContent?: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={clsx(`dropdown dropdown-bottom`, className)}>
      <Button tabIndex={0} tooltip={tooltip}>
        <div className="flex items-center">
          {value}
          <BiChevronDown className="text-xs" />
        </div>
      </Button>
      <ul tabIndex={0} className="menu dropdown-content rounded-box bg-base-100 z-50 p-2 shadow-sm">
        {renderContent ?? (contents ? contents.map((content, index) => <li key={index}>{content}</li>) : null)}
      </ul>
    </div>
  );
};

const CodeBlockButton = () => {
  const { l } = usePage();
  const editor = useEditorRef();

  return (
    <Button
      tooltip={l("shared.editor-codeBlock")}
      onClick={() => {
        insertEmptyCodeBlock(editor, {
          defaultType: ELEMENT_DEFAULT,
          insertNodesOptions: { select: true },
        });
        focusEditor(editor);
      }}
    >
      <BiCodeBlock />
    </Button>
  );
};

const MarkToolbarButton = ({
  nodeType,
  children,
  tooltip,
}: {
  nodeType: string;
  children: ReactNode;
  tooltip: string;
}) => {
  const state = useMarkToolbarButtonState({ nodeType });
  const { props } = useMarkToolbarButton(state);

  return (
    <div>
      <Button tooltip={tooltip} isActive={props.pressed} {...props}>
        {children}
      </Button>
    </div>
  );
};

const AlignDropdownMenu = () => {
  const { l } = usePage();

  const items = [
    {
      value: "left",
      icon: <BiAlignLeft />,
    },
    {
      value: "center",
      icon: <BiAlignMiddle />,
    },
    {
      value: "right",
      icon: <BiAlignRight />,
    },
    {
      value: "justify",
      icon: <BiAlignJustify />,
    },
  ];

  const state = useAlignDropdownMenuState();
  const {
    radioGroupProps: { value, onValueChange },
  } = useAlignDropdownMenu(state);

  return (
    <>
      <Dropdown
        tooltip={l("shared.editor-align")}
        value={items.find((item) => item.value === value)?.icon ?? <BiAlignLeft />}
        contents={items.map((item) => (
          <button
            key={item.value}
            // className={`btn btn-ghost btn-sm ${value === item.value && "bg-primary text-primary-content"}`}
            onClick={() => {
              onValueChange(item.value);
            }}
          >
            {item.icon}
          </button>
        ))}
      />
    </>
  );
};

const ColorDropdownMenu = ({
  nodeType,
  tooltip,
  children,
}: {
  nodeType: string;
  tooltip: string;
  children: ReactNode;
}) => {
  const state = useColorDropdownMenuState({
    nodeType,
    colors: DEFAULT_COLORS,
    customColors: DEFAULT_CUSTOM_COLORS,
    closeOnSelect: true,
  });
  const { menuProps, buttonProps } = useColorDropdownMenu(state);

  return (
    <div {...menuProps} className="inline-block">
      <Dropdown
        value={children}
        tooltip={tooltip}
        renderContent={
          <div className="grid w-64 grid-cols-8 gap-2 p-4">
            {DEFAULT_COLORS.map((color, index) => (
              <button
                key={index}
                className={`size-5 rounded-lg ${state.selectedColor === color.value && "ring-primary ring-2"}}`}
                style={{ backgroundColor: color.value }}
                onClick={() => {
                  state.updateColorAndClose(color.value);
                }}
              ></button>
            ))}
          </div>
        }
      />
    </div>
  );
};

export const IndentToolbarButton = () => {
  const { l } = usePage();
  const { props } = useIndentButton();
  return (
    <Button tooltip={l("shared.editor-indent")} {...props}>
      <BiRightIndent />
    </Button>
  );
};

export const OutdentToolbarButton = () => {
  const { l } = usePage();
  const { props } = useOutdentButton();
  return (
    <Button tooltip={l("shared.editor-outdent")} {...props}>
      <BiLeftIndent />
    </Button>
  );
};

export const LinkToolbarButton = () => {
  const { l } = usePage();
  const state = useLinkToolbarButtonState();
  const { props } = useLinkToolbarButton(state);
  return (
    <Button tooltip={l("shared.editor-link")} {...props}>
      <BiLinkAlt />
    </Button>
  );
};

const ExcalidrawButton = () => {
  const { l } = usePage();
  const editor = useEditorRef();
  return (
    <Button
      tooltip={l("shared.editor-excalidraw")}
      onClick={() => {
        insertExcalidraw(editor);
      }}
    >
      <BiPen />
    </Button>
  );
};

export const IndentListToolbarButton = ({ nodeType = ListStyleType.Disc }: { nodeType: string }) => {
  const state = useIndentListToolbarButtonState({ nodeType });
  const { props } = useIndentListToolbarButton(state);
  const { l } = usePage();

  return (
    <Button
      // isActive={props.pressed}
      {...props}
      tooltip={nodeType === ListStyleType.Disc ? l("shared.editor-bulletedList") : l("shared.editor-numberedList")}
    >
      {nodeType === ListStyleType.Disc ? <BiListUl /> : <BiListOl />}
    </Button>
  );
};

const ImageToolbarButton = ({
  addFilesGql,
  addFile,
}: {
  addFilesGql: (fileList: FileList, id?: string) => Promise<(cnst.File | ProtoFile)[]>;
  addFile: (file: cnst.File | cnst.File[], options?: { idx?: number; limit?: number }) => void;
}) => {
  const { l } = usePage();
  const editor = useEditorRef();
  const [showPopup, setShowPopup] = useState(false);
  const [popupType, setPopupType] = useState<"image" | "link">("image");
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<ProtoFile | cnst.File | null>(null);

  const closePopup = () => {
    setShowPopup(false);
    setImageUrl("");
    setFile(null);
  };

  const onSubmitLink = () => {
    insertImage(editor, imageUrl);
    setShowPopup(false);
    setImageUrl("");
  };

  const onSubmitImage = () => {
    if (!file) return;

    const intervalKey = setInterval(() => {
      void (async () => {
        const currentFile = await fetch.file(file.id);
        if (currentFile.status === "active" && currentFile.url) {
          clearInterval(intervalKey);
          addFile(currentFile);
          insertImage(editor, currentFile.url);
          closePopup();
        }
      })();
    }, 1000);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const [file] = await addFilesGql([e.target.files[0]] as unknown as FileList);
    setFile(file);
  };

  return (
    <div>
      <Button
        tooltip={l("shared.editor-image")}
        onClick={() => {
          setShowPopup(true);
        }}
      >
        <BiImage />
      </Button>
      {showPopup && (
        <>
          <div className="bg-base-100/50 fixed inset-0 z-40 cursor-pointer" onClick={closePopup} />
          <div className="bg-base-100 outline-nones absolute left-1/2 top-1/2 z-50 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-md border border-black/20 p-4 shadow-md md:w-80">
            <div className="mb-4 flex items-center justify-between">
              <div className="join">
                <button
                  className={`btn join-item btn-sm ${popupType === "image" && "btn-active"}`}
                  onClick={() => {
                    setPopupType("image");
                  }}
                >
                  {l("shared.editor-image")}
                </button>
                <button
                  className={`btn join-item btn-sm ${popupType === "link" && "btn-active"}`}
                  onClick={() => {
                    setPopupType("link");
                  }}
                >
                  {l("shared.editor-link")}
                </button>
              </div>
              <button className="cursor-pointer text-lg" onClick={closePopup}>
                <BiX />
              </button>
            </div>
            <div>
              {popupType === "image" && (
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    className="file-input file-input-ghost file-input-sm mb-10 w-full max-w-xs"
                    onChange={(e) => void handleFileChange(e)}
                  />
                  <button onClick={onSubmitImage} className="btn btn-sm w-full" disabled={!file}>
                    {l("shared.editor-uploadImage")}
                  </button>
                </div>
              )}
              {popupType === "link" && (
                <div>
                  <div className="text-muted-foreground mb-10 flex items-center gap-2 pl-3">
                    <BiLinkAlt />
                    <input
                      type="text"
                      className="input input-ghost input-sm w-full"
                      value={imageUrl}
                      onChange={(e) => {
                        setImageUrl(e.target.value);
                      }}
                      placeholder="Image URL"
                    />
                  </div>
                  <button onClick={onSubmitLink} className="btn btn-sm w-full" disabled={!imageUrl}>
                    {l("shared.editor-addImage")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const MediaToolbarButton = ({
  nodeType,
  children,
  tooltip,
}: {
  nodeType: typeof ELEMENT_IMAGE | typeof ELEMENT_MEDIA_EMBED;
  children: ReactNode;
  tooltip: string;
}) => {
  const { props } = useMediaToolbarButton({ nodeType });

  return (
    <div>
      <Button tooltip={tooltip} {...props}>
        {children}
      </Button>
    </div>
  );
};

const TableDropdownMenu = () => {
  const { l } = usePage();
  const tableSelected = useEditorSelector((editor) => someNode(editor, { match: { type: ELEMENT_TABLE } }), []);

  const editor = useEditorRef();
  const buttonClassName = "btn btn-sm whitespace-nowrap w-full flex justify-start items-center flex-nowrap";
  const labelClassName = "mt-4 mb-2 text-lg";
  return (
    <Dropdown
      value={<BiTable />}
      tooltip={l("shared.editor-table")}
      renderContent={
        <div className="z-50 flex flex-col items-start justify-start gap-2">
          <div className="labelClassName">{l("shared.editor-table")}</div>
          <button
            className={buttonClassName}
            onClick={() => {
              insertTable(editor);
              focusEditor(editor);
            }}
          >
            <BiPlus /> {l("shared.editor-insertTable")}
          </button>
          <button
            className={clsx(buttonClassName, !tableSelected && "btn-disabled")}
            onClick={() => {
              deleteTable(editor);
              focusEditor(editor);
            }}
          >
            <BiTrashAlt />
            {l("shared.editor-deleteTable")}
          </button>
          <div className="labelClassName">{l("shared.editor-column")}</div>
          <button
            className={clsx(buttonClassName, !tableSelected && "btn-disabled")}
            onClick={() => {
              insertTableColumn(editor);
              focusEditor(editor);
            }}
          >
            <BiPlus />
            {l("shared.editor-columnAfter")}
          </button>
          <button
            className={clsx(buttonClassName, !tableSelected && "btn-disabled")}
            onClick={() => {
              deleteColumn(editor);
              focusEditor(editor);
            }}
          >
            <BiMinus />
            {l("shared.editor-deleteColumn")}
          </button>
          <div className="labelClassName"> {l("shared.editor-row")}</div>
          <button
            className={clsx(buttonClassName, !tableSelected && "btn-disabled")}
            onClick={() => {
              insertTableRow(editor);
              focusEditor(editor);
            }}
          >
            <BiPlus /> {l("shared.editor-rowAfter")}
          </button>
          <button
            className={clsx(buttonClassName, !tableSelected && "btn-disabled")}
            onClick={() => {
              deleteRow(editor);
              focusEditor(editor);
            }}
          >
            <BiMinus /> {l("shared.editor-deleteRow")}
          </button>
        </div>
      }
    />
  );
};

const LineHeightDropdownMenu = () => {
  const { l } = usePage();
  const state = useLineHeightDropdownMenuState();
  const { radioGroupProps } = useLineHeightDropdownMenu(state);
  return (
    <Dropdown
      value={<AiOutlineLineHeight />}
      tooltip={l("shared.editor-lineHeight")}
      contents={state.values.map((item: string) => (
        <button
          key={item}
          className={`btn btn-ghost btn-sm ${state.value === item && "bg-primary text-primary-content"}`}
          onClick={() => {
            radioGroupProps.onValueChange(item);
          }}
        >
          {item}
        </button>
      ))}
    />
  );
};

const InsertDropdownMenu = () => {
  const editor = useEditorRef();
  const { l } = usePage();

  const items = [
    {
      label: "Basic blocks",
      items: [
        {
          value: ELEMENT_PARAGRAPH,
          label: l("shared.editor-paragraph"),
          description: l("shared.editor-paragraph"),
          icon: <BiParagraph />,
        },
        {
          value: ELEMENT_H1,
          label: l("shared.editor-heading1"),
          description: l("shared.editor-heading1"),
          icon: (
            <div className="font-bold">
              H<span className="text-xs">1</span>
            </div>
          ),
        },
        {
          value: ELEMENT_H2,
          label: l("shared.editor-heading2"),
          description: l("shared.editor-heading2"),
          icon: (
            <div className="font-bold">
              H<span className="text-xs">2</span>
            </div>
          ),
        },
        {
          value: ELEMENT_H3,
          label: l("shared.editor-heading3"),
          description: l("shared.editor-heading3"),
          icon: (
            <div className="font-bold">
              H<span className="text-xs">3</span>
            </div>
          ),
        },
        {
          value: ELEMENT_BLOCKQUOTE,
          label: l("shared.editor-quote"),
          description: l("shared.editor-quote"),
          icon: <BiSolidQuoteRight />,
        },
      ],
    },
  ];

  return (
    <Dropdown
      value={<BiPlus />}
      tooltip={l("shared.editor-insert")}
      renderContent={items.map(({ items: nestedItems, label }, index) => (
        <div key={label} className="w-40 text-lg leading-10">
          {nestedItems.map(({ value: type, label: itemLabel, icon }) => (
            <div
              key={type}
              onClick={() => {
                switch (type) {
                  default: {
                    insertEmptyElement(editor, type, {
                      select: true,
                      nextBlock: true,
                    });
                  }
                }
                focusEditor(editor);
              }}
              className="hover:bg-base-200 flex cursor-pointer items-center px-2 py-1 hover:opacity-50"
            >
              <div className="w-10">{icon}</div>
              <div className="text-base">{itemLabel}</div>
            </div>
          ))}
        </div>
      ))}
    />
  );
};

const TurnIntoDropdownMenu = () => {
  const { l } = usePage();
  const items = [
    {
      value: ELEMENT_PARAGRAPH,
      label: l("shared.editor-paragraph"),
      description: l("shared.editor-paragraph"),
      icon: <BiParagraph />,
    },
    {
      value: ELEMENT_H1,
      label: l("shared.editor-heading1"),
      description: l("shared.editor-heading1"),
      icon: (
        <div className="font-bold">
          H<span className="text-xs">1</span>
        </div>
      ),
    },
    {
      value: ELEMENT_H2,
      label: l("shared.editor-heading2"),
      description: l("shared.editor-heading2"),
      icon: (
        <div className="font-bold">
          H<span className="text-xs">2</span>
        </div>
      ),
    },
    {
      value: ELEMENT_H3,
      label: l("shared.editor-heading3"),
      description: l("shared.editor-heading3"),
      icon: (
        <div className="font-bold">
          H<span className="text-xs">3</span>
        </div>
      ),
    },
    {
      value: ELEMENT_BLOCKQUOTE,
      label: l("shared.editor-quote"),
      description: l("shared.editor-quote"),
      icon: <BiSolidQuoteRight />,
    },
  ];

  const defaultItem = items.find((item) => item.value === ELEMENT_PARAGRAPH);

  const value: string = useEditorSelector((editor) => {
    if (isCollapsed(editor.selection)) {
      const entry = findNode<TElement>(editor, {
        match: (n) => isBlock(editor, n),
      });
      if (entry) {
        return items.find((item) => item.value === entry[0].type)?.value ?? ELEMENT_PARAGRAPH;
      }
    }
    return ELEMENT_PARAGRAPH;
  }, []);

  const editor = useEditorRef();
  if (!defaultItem) return null;
  const selectedItem = items.find((item) => item.value === value) ?? defaultItem;
  const { icon: SelectedItemIcon, label: selectedItemLabel } = selectedItem;

  return (
    <Dropdown
      value={<div className="text-sm">{selectedItemLabel}</div>}
      tooltip={l("shared.editor-ternInto")}
      renderContent={
        <div className="w-40 text-lg leading-10">
          {items.map(({ value: type, label: itemLabel, icon }) => (
            <div
              key={type}
              onClick={() => {
                toggleNodeType(editor, { activeType: type });
                collapseSelection(editor);
                focusEditor(editor);
              }}
              className="hover:bg-base-200 flex cursor-pointer items-center px-2 py-1 hover:opacity-50"
            >
              <div className="w-10">{icon}</div>
              <div className="text-base">{itemLabel}</div>
            </div>
          ))}
        </div>
      }
    />
  );
};
