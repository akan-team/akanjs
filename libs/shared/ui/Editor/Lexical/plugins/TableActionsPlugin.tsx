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
import { mergeRegister } from "@lexical/utils";
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AiOutlineDelete,
  AiOutlineInsertRowAbove,
  AiOutlineInsertRowBelow,
  AiOutlineInsertRowLeft,
  AiOutlineInsertRowRight,
} from "react-icons/ai";
import { RiDeleteColumn, RiDeleteRow, RiLayoutColumnLine, RiLayoutRowLine } from "react-icons/ri";

import type { CellAnchor } from "./tableActionsPlugin.type";

/**
 * Floating table toolbar. When the caret sits inside a table cell it anchors a
 * compact action bar to that cell offering row/column insert & delete, header
 * row/column toggles, and whole-table delete. Positioned `fixed` in a body
 * portal so it escapes the editor's overflow, and repositioned on scroll/resize
 * (mirrors `CalloutPlugin`). Mounted only while the editor is editable.
 */
export const TableActionsPlugin = () => {
  const [editor] = useLexicalComposerContext();
  const [anchor, setAnchor] = useState<CellAnchor | null>(null);

  // Recompute the anchored cell + its viewport rect from the current selection.
  const sync = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        setAnchor(null);
        return;
      }
      const cell = $getTableCellNodeFromLexicalNode(selection.anchor.getNode());
      if (!cell) {
        setAnchor(null);
        return;
      }
      const dom = editor.getElementByKey(cell.getKey());
      if (!dom) {
        setAnchor(null);
        return;
      }
      setAnchor({ cellKey: cell.getKey(), rect: dom.getBoundingClientRect() });
    });
  }, [editor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          sync();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerUpdateListener(() => sync()),
    );
  }, [editor, sync]);

  useEffect(() => {
    if (!anchor) return;
    const reposition = () => sync();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [anchor, sync]);

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
    setAnchor(null);
  }, [editor, anchor]);

  if (!anchor) return null;

  return createPortal(
    <div
      className="fixed z-50 flex items-center gap-0.5 rounded-lg border border-base-content/15 bg-base-100 p-1 text-base-content shadow-xl"
      style={{ top: anchor.rect.top - 44, left: anchor.rect.left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <TableActionButton title="Insert row above" onClick={() => run(() => $insertTableRowAtSelection(false))}>
        <AiOutlineInsertRowAbove />
      </TableActionButton>
      <TableActionButton title="Insert row below" onClick={() => run(() => $insertTableRowAtSelection(true))}>
        <AiOutlineInsertRowBelow />
      </TableActionButton>
      <TableActionButton title="Insert column left" onClick={() => run(() => $insertTableColumnAtSelection(false))}>
        <AiOutlineInsertRowLeft />
      </TableActionButton>
      <TableActionButton title="Insert column right" onClick={() => run(() => $insertTableColumnAtSelection(true))}>
        <AiOutlineInsertRowRight />
      </TableActionButton>
      <span className="mx-0.5 h-5 w-px bg-base-content/15" />
      <TableActionButton title="Toggle header row" onClick={() => toggleHeader("row")}>
        <RiLayoutRowLine />
      </TableActionButton>
      <TableActionButton title="Toggle header column" onClick={() => toggleHeader("column")}>
        <RiLayoutColumnLine />
      </TableActionButton>
      <span className="mx-0.5 h-5 w-px bg-base-content/15" />
      <TableActionButton title="Delete row" onClick={() => run(() => $deleteTableRowAtSelection())}>
        <RiDeleteRow />
      </TableActionButton>
      <TableActionButton title="Delete column" onClick={() => run(() => $deleteTableColumnAtSelection())}>
        <RiDeleteColumn />
      </TableActionButton>
      <TableActionButton title="Delete table" onClick={deleteTable}>
        <AiOutlineDelete className="text-error" />
      </TableActionButton>
    </div>,
    document.body,
  );
};

interface TableActionButtonProps {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}

export const TableActionButton = ({ children, title, onClick }: TableActionButtonProps) => (
  <button type="button" title={title} className="btn btn-xs btn-ghost min-h-7 px-1.5" onClick={onClick}>
    {children}
  </button>
);
