import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { PopoverAnchor } from "@radix-ui/react-popover";
import { cn, withRef } from "@udecode/cn";
import {
  isSelectionExpanded,
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useElement,
  useRemoveNodeButton,
  withHOC,
} from "@udecode/plate-common";
import {
  mergeTableCells,
  TableProvider,
  TTableElement,
  unmergeTableCells,
  useTableBordersDropdownMenuContentState,
  useTableElement,
  useTableElementState,
  useTableMergeState,
} from "@udecode/plate-table";
import React from "react";
import {
  BiBorderAll,
  BiBorderBottom,
  BiBorderLeft,
  BiBorderNone,
  BiBorderRight,
  BiBorderTop,
  BiTrashAlt,
} from "react-icons/bi";
import { useReadOnly, useSelected } from "slate-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "./DropdownMenu";
import { Popover, PopoverContent, popoverVariants } from "./Popover";

export const TableBordersDropdownMenuContent = withRef<typeof DropdownMenuPrimitive.Content>((props, ref) => {
  const {
    getOnSelectTableBorder,
    hasOuterBorders,
    hasBottomBorder,
    hasLeftBorder,
    hasNoBorders,
    hasRightBorder,
    hasTopBorder,
  } = useTableBordersDropdownMenuContentState();

  return (
    <DropdownMenuContent
      ref={ref}
      className={cn("min-w-[220px] bg-base-100")}
      side="right"
      align="start"
      sideOffset={0}
      {...props}
    >
      <DropdownMenuCheckboxItem checked={hasBottomBorder} onCheckedChange={getOnSelectTableBorder("bottom")}>
        <BiBorderBottom className="text-sm" />
        <div>Bottom Border</div>
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem checked={hasTopBorder} onCheckedChange={getOnSelectTableBorder("top")}>
        <BiBorderTop className="text-sm" />
        <div>Top Border</div>
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem checked={hasLeftBorder} onCheckedChange={getOnSelectTableBorder("left")}>
        <BiBorderLeft className="text-sm" />
        <div>Left Border</div>
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem checked={hasRightBorder} onCheckedChange={getOnSelectTableBorder("right")}>
        <BiBorderRight className="text-sm" />
        <div>Right Border</div>
      </DropdownMenuCheckboxItem>

      <div className="border-base-300 my-4 border-b" />

      <DropdownMenuCheckboxItem checked={hasNoBorders} onCheckedChange={getOnSelectTableBorder("none")}>
        <BiBorderNone className="text-sm" />
        <div>No Border</div>
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem checked={hasOuterBorders} onCheckedChange={getOnSelectTableBorder("outer")}>
        <BiBorderAll className="text-sm" />
        <div>Outside Borders</div>
      </DropdownMenuCheckboxItem>
    </DropdownMenuContent>
  );
});

export const TableFloatingToolbar = withRef<typeof PopoverContent>(({ children, ...props }, ref) => {
  const element = useElement<TTableElement>();
  const { props: buttonProps } = useRemoveNodeButton({ element });

  const selectionCollapsed = useEditorSelector((editor) => !isSelectionExpanded(editor), []);

  const readOnly = useReadOnly();
  const selected = useSelected();
  const editor = useEditorRef();

  const collapsed = !readOnly && selected && selectionCollapsed;
  const open = !readOnly && selected;

  const { canMerge, canUnmerge } = useTableMergeState();

  const mergeContent = canMerge && (
    <button
      className="btn btn-ghost btn-sm"
      onClick={() => {
        mergeTableCells(editor);
      }}
    >
      {/* <Icons.combine className="mr-2 size-4" /> */}
      Merge
    </button>
  );

  const unmergeButton = canUnmerge && (
    <button
      className="btn btn-ghost btn-sm"
      onClick={() => {
        unmergeTableCells(editor);
      }}
    >
      {/* <Icons.ungroup className="mr-2 size-4" /> */}
      Unmerge
    </button>
  );

  const bordersContent = collapsed && (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button className="btn btn-ghost btn-sm justify-start">
            <BiBorderAll className="mr-2" />
            Borders
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuPortal>
          <TableBordersDropdownMenuContent />
        </DropdownMenuPortal>
      </DropdownMenu>
      <button className="btn btn-ghost btn-sm justify-start" {...buttonProps}>
        <BiTrashAlt className="mr-2" />
        Delete
      </button>
    </>
  );

  return (
    <Popover open={open} modal={false}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      {(canMerge || canUnmerge || collapsed) && (
        <PopoverContent
          ref={ref}
          className={cn(popoverVariants(), "flex w-[220px] flex-col gap-1 p-1 bg-base-100")}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
          }}
          {...props}
        >
          {unmergeButton}
          {mergeContent}
          {bordersContent}
        </PopoverContent>
      )}
    </Popover>
  );
});

export const TableElement = withHOC(
  TableProvider,
  withRef<typeof PlateElement>(({ className, children, ...props }, ref) => {
    const { colSizes, isSelectingCell, minColumnWidth, marginLeft } = useTableElementState();
    const { props: tableProps, colGroupProps } = useTableElement();

    return (
      <TableFloatingToolbar>
        <div style={{ paddingLeft: marginLeft }}>
          <PlateElement
            ref={ref}
            asChild
            className={cn(
              "my-4 ml-px mr-0 table h-px w-full table-fixed border-collapse",
              isSelectingCell && "[&_*::selection]:bg-none",
              className
            )}
            {...tableProps}
            {...props}
          >
            <table>
              <colgroup {...colGroupProps}>
                {colSizes.map((width, index) => (
                  <col
                    key={index}
                    style={{
                      minWidth: minColumnWidth,
                      width: width || undefined,
                    }}
                  />
                ))}
              </colgroup>

              <tbody className="min-w-full">{children}</tbody>
            </table>
          </PlateElement>
        </div>
      </TableFloatingToolbar>
    );
  })
);
