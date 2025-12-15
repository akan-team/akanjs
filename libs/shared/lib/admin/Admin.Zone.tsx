"use client";
import { ClientView } from "@akanjs/signal";
import { Load } from "@akanjs/ui";
import { Admin as AdminComponent, cnst } from "@shared/client";

export const View = ({ view }: { view: ClientView<"admin", cnst.Admin> }) => {
  return <Load.View view={view} renderView={(admin) => <AdminComponent.View.General admin={admin} />} />;
};
