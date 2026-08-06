"use client";
import type { Dayjs } from "akanjs/base";
import { cn, type DataAction, type DataColumn, usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
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

export const convToAntdColumn = (column: DataColumn<any>) => {
  if (typeof column !== "string")
    return {
      key: column.key as string,
      dataIndex: column.key as string,
      title: capitalize(column.key as string),
      responsive: column.responsive ? (["xs", "sm", "md", "xl"] as const) : undefined,
      render: column.render,
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
  else return { key: column, dataIndex: column, title: capitalize(column) };
};

interface ItemProps<T extends string, Full extends { id: string }, Light extends { id: string }> {
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
    .map((action, idx) => <Action key={action} action={action} outline={false} model={model} slice={slice} />);

  const customActions = actions
    .filter((action) => typeof action !== "string")
    .map((action, idx) => ({ key: idx, label: action }));

  const extraCols = columns
    .filter((column) => {
      const key = typeof column === "string" ? column : (column.key as string);
      return !["id", "status", "createdAt"].includes(key);
    })
    .map((column, idx) => {
      const key = (typeof column === "string" ? column : column.key) as string;
      const title = typeof column !== "string" && column.title ? column.title : l._(`${sliceName}.${key}`);
      const render = convToAntdColumn(column).render ?? ((v: any, m: any, i: number) => JSON.stringify(v, null, 2));
      const modelKeyLength = (model as unknown as { [key: string]: any[] | undefined })[key]?.length;
      if (convToAntdColumn(column).render) {
        return (
          <div key={key} className="flex-wrap overflow-hidden text-xs">
            {!!modelKeyLength && (
              <span className="flex items-center gap-3">
                <span className="whitespace-nowrap font-semibold">{title}</span>
                <span className="text-sm">{render(model[key as keyof typeof model], model, idx)}</span>
              </span>
            )}
          </div>
        );
      }

      return (
        <div key={key} className="flex-wrap overflow-hidden text-xs">
          {!!modelKeyLength && (
            <span className="flex items-center gap-3">
              <span className="whitespace-nowrap font-semibold">{title}</span>
              <span className="text-sm">{model[key as keyof typeof model] as string}</span>
            </span>
          )}
        </div>
      );
    });

  return (
    <div className={cn("flex flex-col", className)}>
      {children ? (
        <div className="flex justify-center">
          <div className="relative size-full" onClick={onClick}>
            {children}
            <div className="absolute inset-0" />
            {/* children 클릭 방지 */}
          </div>
        </div>
      ) : title ? (
        <div className="font-bold">{title}</div>
      ) : null}
      <div className="mt-2 h-full rounded-lg bg-primary/5 p-2">
        <div className="mb-2 flex justify-between">
          <div>{columns.find((c) => c === "id") && <ObjectId id={model.id} />}</div>

          <div className="flex items-end justify-center gap-2">
            {columns.find((c) => c === "createdAt") && (
              <RecentTime date={(model as unknown as BaseObject).createdAt} className="text-xs opacity-60" />
            )}
            {columns.find((c) => c === "status") && (
              <StatusTag status={(model as unknown as { status: string }).status} className="mr-0 p-2" />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1">{extraCols}</div>
        <div className="flex w-full justify-around">
          {strActions.map((action) => (
            <div className="" key={action.key}>
              {action}
            </div>
          ))}
          {customActions.length ? (
            <Dropdown
              buttonClassName={buttonRecipe({ variant: "ghost", size: "icon" }, "m-1 size-8 text-center")}
              value={<AiOutlineMore />}
              content={customActions.map((action) => <div key={action.key}>{action.label}</div>)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface ActionProps<T extends string, M extends { id: string }, L extends { id: string }> {
  action: DataAction;
  model: L;
  slice: SliceMeta;
}
export const Action = <T extends string, M extends { id: string }, L extends { id: string }>({
  action,
  model,
  slice,
  outline = true,
}: ActionProps<T, M, L> & { outline?: boolean }) => {
  const { l } = usePage();
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const storeGet = st.get as unknown as <T>() => { [key: string]: T };
  const { refName, sliceName } = slice;
  const [modelName, modelClassName] = [refName, capitalize(refName)];
  const names = {
    model: modelName,
    editModel: `edit${modelClassName}`,
    viewModel: `view${modelClassName}`,
    removeModel: `remove${modelClassName}`,
  };
  const namesOfSlice = {
    editModel: sliceName.replace(names.model, names.editModel),
    viewModel: sliceName.replace(names.model, names.viewModel),
    removeModel: sliceName.replace(names.model, names.removeModel),
  };
  return action === "edit" ? (
    <button
      className={buttonRecipe({ variant: outline ? "outline" : "ghost", size: "icon" }, [
        "m-1 size-8 text-center",
        outline && "border-dashed",
      ])}
      onClick={() => void storeDo[namesOfSlice.editModel](model.id)}
    >
      <AiOutlineEdit key={action} />
    </button>
  ) : action === "view" ? (
    <button
      className={buttonRecipe({ variant: outline ? "outline" : "ghost", size: "icon" }, [
        "m-1 size-8 text-center",
        outline && "border-dashed",
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
        className={buttonRecipe({ variant: outline ? "outline" : "ghost", size: "icon" }, [
          "m-1 size-8 text-center",
          outline && "border-dashed",
        ])}
      >
        <AiOutlineDelete />
      </button>
    </Popconfirm>
  ) : (
    action
  );
};

// daisyui badge-* 매핑 → 시맨틱 토큰 색 오버라이드(badgeRecipe outline 위에 얹음). "-outline"류는 색 테두리+텍스트만.
const statusColors = {
  active: "border-info text-info",
  applied: "border-transparent bg-warning text-warning-foreground",
  approved: "border-transparent bg-success text-success-foreground",
  denied: "border-destructive text-destructive",
  failed: "border-destructive text-destructive",
  restricted: "border-transparent bg-destructive text-destructive-foreground",
  paused: "",
  running: "border-warning text-warning",
  break: "border-accent text-accent",
  rejected: "border-destructive text-destructive",
  hidden: "",
  inProgress: "border-transparent bg-accent text-accent-foreground",
  resolved: "border-success text-success",
  finished: "border-transparent bg-secondary text-secondary-foreground",
};
const StatusTag = ({ status, className }: { status: string; className?: string }) => {
  return (
    <div
      className={badgeRecipe({ variant: "outline" }, [
        "mr-1 p-3",
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
