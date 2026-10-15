import type { Me, Self } from "@libs/shared/common";
import type { SignalContext } from "akanjs/signal";
import type { SerAccount } from "./account";

export type CallerAccount = SerAccount<{ self?: Self; me?: Me }>;
export type CallerRole = "user" | "viewer" | "manager" | "admin" | "superAdmin";

export const staffRoles = ["viewer", "manager", "admin", "superAdmin"] as const;

export const accountOf = (context: SignalContext) => context.get<CallerAccount>("account");

export const hasRole = (account: CallerAccount | null, role: CallerRole) =>
  role === "user"
    ? !!account?.self && !account.self.removedAt && account.self.roles.includes("user")
    : !!account?.me && !account.me.removedAt && account.me.roles.includes(role);

/** An admin who can run the console: `admin` or `superAdmin`, not removed. */
export const isAdmin = (account: CallerAccount | null) => hasRole(account, "admin") || hasRole(account, "superAdmin");

/** Any admin role, `viewer` included, not removed. */
export const isStaff = (account: CallerAccount | null) => staffRoles.some((role) => hasRole(account, role));

/** The signed-in end user, or null when the caller is anonymous, removed, or not a `user`. */
export const activeUserId = (account: CallerAccount | null) =>
  hasRole(account, "user") ? (account?.self?.id ?? null) : null;
