"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $getTableCellNodeFromLexicalNode,
  $getTableColumnIndexFromTableCellNode,
  $getTableNodeFromLexicalNodeOrThrow,
  $getTableRowIndexFromTableCellNode,
  $insertTableColumnAtSelection,
  $insertTableRowAtSelection,
  $isTableCellNode,
  $setTableColumnIsHeader,
  $setTableRowIsHeader,
  TableCellHeaderStates,
} from "@lexical/table";
import { usePage } from "@libs/shared/client";
import { buttonRecipe } from "@libs/util/ui";
import { cn } from "akanjs/client";
import { $getNodeByKey, $getSelection, $isRangeSelection } from "lexical";
import { type ReactNode, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  AiOutlineDelete,
  AiOutlineInsertRowAbove,
  AiOutlineInsertRowBelow,
  AiOutlineInsertRowLeft,
  AiOutlineInsertRowRight,
} from "react-icons/ai";
import { RiDeleteColumn, RiDeleteRow, RiLayoutColumnLine, RiLayoutRowLine } from "react-icons/ri";
import { editorOverlayLayer, useSelectionAnchor } from "../selectionAnchor";
import type { CellAnchor } from "./tableActionsPlugin.type";

/**
 * Floating table toolbar. When the caret sits inside a table cell it anchors a
 * compact action bar to that cell offering row/column insert & delete, header
 * row/column toggles, and whole-table delete. Positioned `fixed` in a body
 * portal so it escapes the editor's overflow. Mounted only while the editor is editable.
 */
export const TableActionsPlugin = () => {
  const [editor] = useLexicalComposerContext();
  const { l } = usePage();
  const anchor = useSelectionAnchor<CellAnchor>(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return null;
    const cell = $getTableCellNodeFromLexicalNode(selection.anchor.getNode());
    const dom = cell ? editor.getElementByKey(cell.getKey()) : null;
    return cell && dom ? { cellKey: cell.getKey(), rect: dom.getBoundingClientRect() } : null;
  });

  const run = useCallback(
    (mutate: () => void) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) mutate();
      });
    },
    [editor],
  );

  // Toggles the header flag for the current cell's whole row or column.
  const toggleHeader = useCallback(
    (axis: "row" | "column") => {
      editor.update(() => {
        const node = anchor ? $getNodeByKey(anchor.cellKey) : null;
        if (!$isTableCellNode(node)) return;
        const table = $getTableNodeFromLexicalNodeOrThrow(node);
        if (axis === "row") {
          const rowIndex = $getTableRowIndexFromTableCellNode(node);
          const isHeader = (node.getHeaderStyles() & TableCellHeaderStates.ROW) === TableCellHeaderStates.ROW;
          $setTableRowIsHeader(table, rowIndex, !isHeader);
        } else {
          const columnIndex = $getTableColumnIndexFromTableCellNode(node);
          const isHeader = (node.getHeaderStyles() & TableCellHeaderStates.COLUMN) === TableCellHeaderStates.COLUMN;
          $setTableColumnIsHeader(table, columnIndex, !isHeader);
        }
      });
    },
    [editor, anchor],
  );

  const deleteTable = useCallback(() => {
    editor.update(() => {
      const node = anchor ? $getNodeByKey(anchor.cellKey) : null;
      if (!$isTableCellNode(node)) return;
      $getTableNodeFromLexicalNodeOrThrow(node).remove();
    });
  }, [editor, anchor]);

  if (!anchor) return null;

  return createPortal(
    <div
      className={cn(
        "fixed flex items-center gap-0.5 rounded-lg border border-foreground/15 bg-background p-1 text-foreground shadow-xl",
        editorOverlayLayer,
      )}
      style={{ top: anchor.rect.top - 44, left: anchor.rect.left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <TableActionButton
        title={l("shared.editor-rowAbove")}
        onClick={() => run(() => $insertTableRowAtSelection(false))}
      >
        <AiOutlineInsertRowAbove />
      </TableActionButton>
      <TableActionButton
        title={l("shared.editor-rowBelow")}
        onClick={() => run(() => $insertTableRowAtSelection(true))}
      >
        <AiOutlineInsertRowBelow />
      </TableActionButton>
      <TableActionButton
        title={l("shared.editor-columnLeft")}
        onClick={() => run(() => $insertTableColumnAtSelection(false))}
      >
        <AiOutlineInsertRowLeft />
      </TableActionButton>
      <TableActionButton
        title={l("shared.editor-columnRight")}
        onClick={() => run(() => $insertTableColumnAtSelection(true))}
      >
        <AiOutlineInsertRowRight />
      </TableActionButton>
      <span className="mx-0.5 h-5 w-px bg-foreground/15" />
      <TableActionButton title={l("shared.editor-headerRow")} onClick={() => toggleHeader("row")}>
        <RiLayoutRowLine />
      </TableActionButton>
      <TableActionButton title={l("shared.editor-headerColumn")} onClick={() => toggleHeader("column")}>
        <RiLayoutColumnLine />
      </TableActionButton>
      <span className="mx-0.5 h-5 w-px bg-foreground/15" />
      <TableActionButton title={l("shared.editor-deleteRow")} onClick={() => run(() => $deleteTableRowAtSelection())}>
        <RiDeleteRow />
      </TableActionButton>
      <TableActionButton
        title={l("shared.editor-deleteColumn")}
        onClick={() => run(() => $deleteTableColumnAtSelection())}
      >
        <RiDeleteColumn />
      </TableActionButton>
      <TableActionButton title={l("shared.editor-deleteTable")} onClick={deleteTable}>
        <AiOutlineDelete className="text-destructive" />
      </TableActionButton>
    </div>,
    document.body,
  );
};

interface TableActionButtonProps {
  children: ReactNode;
  title: string;
  onClick: () => void;
}

export const TableActionButton = ({ children, title, onClick }: TableActionButtonProps) => (
  <button
    type="button"
    title={title}
    className={buttonRecipe({ size: "xs", variant: "ghost" }, "min-h-7 px-1.5")}
    onClick={onClick}
  >
    {children}
  </button>
);
