"use client";
import { cnst, st } from "@shared/client";

interface UserProps {
  children?: React.ReactNode | React.ReactNode[];
  roles?: cnst.UserRole["value"][];
  showUnauhtorized?: boolean;
}
export const User = ({ children, roles, showUnauhtorized }: UserProps) => {
  const storeUse = st.use as unknown as { [key: string]: () => unknown };
  const self = storeUse.self() as cnst.User;
  if (!self.id) return null;
  if (roles?.every((role) => !self.roles.includes(role))) return null;
  return <>{children}</>;
};
