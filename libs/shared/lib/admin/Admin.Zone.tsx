"use client";
import { Admin as AdminComponent, type cnst } from "@libs/shared/client";
import type { ClientInit, ClientView } from "akanjs/fetch";
import { Load } from "akanjs/ui";

export const View = ({ view }: { view: ClientView<"admin", cnst.Admin> }) => {
  return <Load.View view={view} renderView={(admin) => <AdminComponent.View.General admin={admin} />} />;
};

interface TableProps {
  className?: string;
  init: ClientInit<"admin", cnst.LightAdmin>;
}
export const Table = ({ className, init }: TableProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(admin) => <AdminComponent.Unit.Row key={admin.id} admin={admin} />}
    />
  );
};
