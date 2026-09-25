"use client";
import { Admin as AdminComponent, type cnst } from "@libs/shared/client";
import type { ClientView } from "akanjs/fetch";
import { Load } from "akanjs/ui";

export const View = ({ view }: { view: ClientView<"admin", cnst.Admin> }) => {
  return <Load.View view={view} renderView={(admin) => <AdminComponent.View.General admin={admin} />} />;
};
