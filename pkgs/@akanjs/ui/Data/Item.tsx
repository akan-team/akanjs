"use client";
import { type BaseObject, Dayjs } from "@akanjs/base";
import { clsx, DataAction, DataColumn, usePage } from "@akanjs/client";
import { capitalize } from "@akanjs/common";
import { st } from "@akanjs/store";
import React, { ReactNode } from "react";
import { AiOutlineDelete, AiOutlineEdit, AiOutlineEye, AiOutlineMore } from "react-icons/ai";

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
  sliceName: T;
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
  sliceName,
  onClick,
  title,
  actions = [],
  columns = [],
  children,
}: ItemProps<T, Full, Light>) {
  const { l } = usePage();
  const strActions = actions
    .filter((action) => typeof action === "string")
    .map((action, idx) => <Action key={idx} action={action} outline={false} model={model} sliceName={sliceName} />);

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
          <div key={idx} className="flex-wrap overflow-hidden text-xs">
            {!!modelKeyLength && (
              <span className="flex items-center gap-3">
                <span className="font-semibold whitespace-nowrap">{title}</span>
                <span className="text-sm">{render(model[key], model, idx)}</span>
              </span>
            )}
          </div>
        );
      }

      return (
        <div key={idx} className="flex-wrap overflow-hidden text-xs">
          {!!modelKeyLength && (
            <span className="flex items-center gap-3">
              <span className="font-semibold whitespace-nowrap">{title}</span>
              <span className="text-sm">{model[key]}</span>
            </span>
          )}
        </div>
      );
    });

  return (
    <div className={clsx("flex flex-col", className)}>
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
      <div className="bg-primary/5 mt-2 h-full rounded-lg p-2">
        <div className="mb-2 flex justify-between">
          <div className="[&_.badge]:badge-xs [&_.badge]:p-2">
            {columns.find((c) => c === "id") && <ObjectId id={model.id} />}
          </div>

          <div className="flex items-end justify-center gap-2">
            {columns.find((c) => c === "createdAt") && (
              <RecentTime date={(model as unknown as BaseObject).createdAt} className="text-xs opacity-60" />
            )}
            {columns.find((c) => c === "status") && (
              <StatusTag status={(model as unknown as { status: string }).status} className="badge-xs mr-0 p-2" />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1">{extraCols}</div>
        <div className="flex w-full justify-around">
          {strActions.map((action, idx) => (
            <div className="" key={idx}>
              {action}
            </div>
          ))}
          {customActions.length ? (
            <Dropdown
              buttonClassName="m-1 text-center btn btn-square btn-ghost btn-sm "
              value={<AiOutlineMore />}
              content={customActions.map((action) => (
                <div key={action.key}>{action.label}</div>
              ))}
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
  sliceName: string;
}
export const Action = <T extends string, M extends { id: string }, L extends { id: string }>({
  action,
  model,
  sliceName,
  outline = true,
}: ActionProps<T, M, L> & { outline?: boolean }) => {
  const { l } = usePage();
  const storeDo = st.do as unknown as { [key: string]: (...args) => Promise<void> };
  const storeGet = st.get as unknown as <T>() => { [key: string]: T };
  const refName = (st.slice as { [key: string]: { refName: string } })[sliceName].refName;
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
      className={`btn btn-square btn-ghost btn-sm m-1 text-center ${outline && "btn-outline border-dashed"}`}
      onClick={() => void storeDo[namesOfSlice.editModel](model.id)}
    >
      <AiOutlineEdit key={action} />
    </button>
  ) : action === "view" ? (
    <button
      className={`btn btn-square btn-ghost btn-sm m-1 text-center ${outline && "btn-outline border-dashed"}`}
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
      <button className={`btn btn-square btn-ghost btn-sm m-1 text-center ${outline && "btn-outline border-dashed"}`}>
        <AiOutlineDelete />
      </button>
    </Popconfirm>
  ) : (
    action
  );
};

const statusColors = {
  active: "badge-info badge-outline",
  applied: "badge-warning",
  approved: "badge-success",
  denied: "badge-error badge-outline",
  failed: "badge-error badge-outline",
  restricted: "badge-error",
  paused: "badge-outline",
  running: "badge-warning badge-outline",
  break: "badge-accent badge-outline",
  rejected: "badge-error badge-outline",
  hidden: "badge-outline",
  inProgress: "badge-accent",
  resolved: "badge-success badge-outline",
  finished: "badge-secondary",
};
const StatusTag = ({ status, className }: { status: string; className?: string }) => {
  return <div className={clsx(`badge mr-1 p-3 ${statusColors[status] ?? "badge-outline"}`, className)}>{status}</div>;
};
Item.StatusTag = StatusTag;

const roleColors = {
  user: "badge-success",
  business: "badge-warning",
  admin: "badge-error badge-outline",
  superAdmin: "badge-error",
  root: "badge-primary",
};
const RoleTags = ({ role }: { role: string | string[] }) => {
  return Array.isArray(role) ? (
    <>
      {role.map((role) => (
        <div className={`badge mr-1 ${roleColors[role]}`} key={role}>
          {role}
        </div>
      ))}
    </>
  ) : (
    <div className="badge mr-1" style={{ backgroundColor: roleColors[role] as string }}>
      {role}
    </div>
  );
};
Item.RoleTags = RoleTags;
