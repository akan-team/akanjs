"use client";
import { type Dayjs, dayjs } from "akanjs/base";
import { cn, type DataAction, type DataColumn, usePage } from "akanjs/client";
import { capitalize, modelNames } from "akanjs/common";
import type { BaseObject } from "akanjs/constant";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import type { ReactNode } from "react";
import { AiOutlineDelete, AiOutlineEdit, AiOutlineEye, AiOutlineMore } from "react-icons/ai";
import { badgeRecipe } from "../Badge";
import { buttonRecipe } from "../Button";
import { Dropdown } from "../Dropdown";
import { ObjectId } from "../ObjectId";
import { Popconfirm } from "../Popconfirm";
import { RecentTime } from "../RecentTime";
import { dictLabel, formatCell } from "./dataText";

// By the value, not the column name: a date field under any name is a Dayjs, which React refuses as a child.
const renderCell = (value: unknown) =>
  value instanceof Date || dayjs.isDayjs(value) ? <RecentTime date={value} /> : formatCell(value);

export const convToAntdColumn = (column: DataColumn<any>) => {
  if (typeof column !== "string")
    return {
      key: column.key as string,
      dataIndex: column.key as string,
      title: capitalize(column.key as string),
      responsive: column.responsive ? (["md", "lg", "xl"] as const) : undefined,
      render: column.render ?? renderCell,
    };
  else if (
    [
      "createdAt",
      "updatedAt",
      "at",
      "At",
      "lastLoginAt",
      "openAt",
      "closeAt",
      "announceAt",
      "startAt",
      "logtime",
    ].includes(column)
  )
    return {
      key: column,
      dataIndex: column,
      title: capitalize(column),
      render: (date: Dayjs) => (
        <div>
          <RecentTime date={date} />
        </div>
      ),
    };
  else if (column.includes("status") || column.includes("Status"))
    return {
      key: column,
      dataIndex: column,
      title: capitalize(column),
      render: (status: string) => <StatusTag status={status} />,
    };
  else if (column.includes("role") || column.includes("Role"))
    return {
      key: column,
      dataIndex: column,
      title: capitalize(column),
      render: (role: string) => <RoleTags role={role} />,
    };
  else return { key: column, dataIndex: column, title: capitalize(column), render: renderCell };
};

interface ItemProps<_T extends string, _Full extends { id: string }, Light extends { id: string }> {
  className?: string;
  model: Light;
  slice: SliceMeta;
  onClick?: () => void;
  cover?: ReactNode;
  title?: ReactNode;
  actions?: DataAction[];
  columns?: DataColumn<any>[];
  children?: ReactNode;
}
export default function Item<T extends string, Full extends { id: string }, Light extends { id: string }>({
  className,
  model,
  slice,
  onClick,
  title,
  actions = [],
  columns = [],
  children,
}: ItemProps<T, Full, Light>) {
  const { l } = usePage();
  const { sliceName } = slice;
  const strActions = actions
    .filter((action) => typeof action === "string")
    .map((action) => (
      <Action key={action} action={action} outline={false} model={model} slice={slice} className="m-0 size-7" />
    ));

  const customActions = actions
    .filter((action) => typeof action !== "string")
    .map((action, idx) => ({ key: idx, label: action }));

  const extraCols = columns
    .filter((column) => {
      const key = typeof column === "string" ? column : (column.key as string);
      return !["id", "status", "createdAt"].includes(key);
    })
    .map((column) => {
      const key = (typeof column === "string" ? column : column.key) as string;
      const value = model[key as keyof typeof model] as unknown;
      // An empty array and an empty string are both "nothing to show"; a 0 or a Date is not.
      if (value === null || value === undefined || (Array.isArray(value) && !value.length) || value === "") return null;
      const title =
        typeof column !== "string" && column.title ? column.title : dictLabel(l._, `${sliceName}.${key}`, key);
      const render = convToAntdColumn(column).render;
      return (
        <div key={key} className="flex items-baseline justify-between gap-3 text-xs">
          <span className="shrink-0 whitespace-nowrap text-muted-foreground">{title}</span>
          <span className="truncate text-right text-foreground/90 text-sm">
            {render ? render(value as never, model) : formatCell(value)}
          </span>
        </div>
      );
    })
    .filter((col) => !!col);
  const [hasId, hasStatus, hasTime] = (["id", "status", "createdAt"] as const).map((key) => columns.includes(key));
  const hasActions = !!(strActions.length || customActions.length);
  const isTimeInFooter = hasTime && hasActions && !hasId && !hasStatus;
  const time = hasTime ? (
    <RecentTime date={(model as unknown as BaseObject).createdAt} className="text-muted-foreground text-xs" />
  ) : null;

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {children ? (
        <div className="flex justify-center">
          <div className="relative size-full" onClick={onClick}>
            {children}
            {/* Covers the children so the click lands on the card, not on them. */}
            <div className="absolute inset-0" />
          </div>
        </div>
      ) : title ? (
        <div className="font-bold">{title}</div>
      ) : null}
      <div
        className={cn(
          "flex h-full flex-col gap-1.5 rounded-box border border-border bg-card px-3 py-2 transition hover:border-primary/40",
          (children || title) && "mt-2",
        )}
      >
        {hasId || hasStatus || (hasTime && !isTimeInFooter) ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">{hasId ? <ObjectId id={model.id} /> : null}</div>
            <div className="flex items-center gap-2">
              {isTimeInFooter ? null : time}
              {hasStatus ? <StatusTag status={(model as unknown as { status: string }).status} /> : null}
            </div>
          </div>
        ) : null}
        {extraCols.length ? <div className="flex flex-col gap-1">{extraCols}</div> : null}
        {hasActions ? (
          <div className="mt-auto flex items-center gap-1 border-border/60 border-t pt-1">
            {isTimeInFooter ? time : null}
            <div className="ml-auto flex items-center gap-1">
              {strActions}
              {customActions.length ? (
                <Dropdown
                  buttonClassName={buttonRecipe({ variant: "ghost", size: "icon" }, "size-7")}
                  value={<AiOutlineMore className="text-foreground" />}
                  content={customActions.map((action) => <li key={action.key}>{action.label}</li>)}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface ActionProps<_T extends string, _M extends { id: string }, L extends { id: string }> {
  action: DataAction;
  model: L;
  slice: SliceMeta;
  className?: string;
}
export const Action = <T extends string, M extends { id: string }, L extends { id: string }>({
  action,
  model,
  slice,
  className,
  outline = true,
}: ActionProps<T, M, L> & { outline?: boolean }) => {
  const { l } = usePage();
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const { refName, sliceName } = slice;
  const names = modelNames(refName);
  const namesOfSlice = {
    editModel: sliceName.replace(names.model, names.editModel),
    viewModel: sliceName.replace(names.model, names.viewModel),
    removeModel: sliceName.replace(names.model, names.removeModel),
  };
  return action === "edit" ? (
    <button
      type="button"
      className={buttonRecipe({ variant: outline ? "outline" : "ghost", size: "icon" }, [
        "m-1 size-8 text-center",
        outline && "border-dashed",
        className,
      ])}
      onClick={() => void storeDo[namesOfSlice.editModel](model.id)}
    >
      <AiOutlineEdit key={action} />
    </button>
  ) : action === "view" ? (
    <button
      type="button"
      className={buttonRecipe({ variant: outline ? "outline" : "ghost", size: "icon" }, [
        "m-1 size-8 text-center",
        outline && "border-dashed",
        className,
      ])}
      onClick={() => void storeDo[namesOfSlice.viewModel](model.id)}
    >
      <AiOutlineEye key={action} />
    </button>
  ) : action === "remove" ? (
    <Popconfirm
      key={action}
      title={l("base.removeMsg")}
      onConfirm={() => void storeDo[namesOfSlice.removeModel](model.id)}
    >
      <button
        type="button"
        className={buttonRecipe({ variant: outline ? "outline" : "ghost", size: "icon" }, [
          "m-1 size-8 text-center",
          outline && "border-dashed",
          className,
        ])}
      >
        <AiOutlineDelete />
      </button>
    </Popconfirm>
  ) : (
    action
  );
};

const statusColors = {
  active: "border-info text-info",
  applied: "border-transparent bg-warning text-warning-foreground",
  approved: "border-transparent bg-success text-success-foreground",
  denied: "border-destructive text-destructive",
  failed: "border-destructive text-destructive",
  restricted: "border-transparent bg-destructive text-destructive-foreground",
  paused: "",
  running: "border-warning text-warning",
  break: "border-muted-foreground text-muted-foreground",
  rejected: "border-destructive text-destructive",
  hidden: "",
  inProgress: "border-transparent bg-info text-info-foreground",
  resolved: "border-success text-success",
  finished: "border-transparent bg-secondary text-secondary-foreground",
};
const StatusTag = ({ status, className }: { status: string; className?: string }) => {
  return (
    <div
      className={badgeRecipe({ variant: "outline", size: "sm" }, [
        statusColors[status as keyof typeof statusColors] ?? "",
        className,
      ])}
    >
      {status}
    </div>
  );
};
Item.StatusTag = StatusTag;

const roleColors = {
  user: "border-transparent bg-success text-success-foreground",
  business: "border-transparent bg-warning text-warning-foreground",
  admin: "border-destructive text-destructive",
  superAdmin: "border-transparent bg-destructive text-destructive-foreground",
  root: "border-transparent bg-primary text-primary-foreground",
};
const RoleTags = ({ role }: { role: string | string[] }) => {
  return Array.isArray(role) ? (
    role.map((role) => (
      <div
        className={badgeRecipe({ variant: "outline" }, ["mr-1", roleColors[role as keyof typeof roleColors]])}
        key={role}
      >
        {role}
      </div>
    ))
  ) : (
    <div className={badgeRecipe({ variant: "outline" }, ["mr-1", roleColors[role as keyof typeof roleColors]])}>
      {role}
    </div>
  );
};
Item.RoleTags = RoleTags;
