"use client";
import { cnst, st } from "@shared/client";
import { ReactNode } from "react";

interface AdminProps {
  children: ReactNode | ReactNode[];
  roles?: cnst.AdminRole["value"][];
}
export const Admin = ({ children, roles }: AdminProps) => {
  const me = st.use.me();
  const path = st.use.path();
  if (path !== "/admin") return null;
  else if (!me.id) return null;
  else if (roles?.every((role) => !me.roles.includes(role))) return null;
  return <>{children}</>;
};
