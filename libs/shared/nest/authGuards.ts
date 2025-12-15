import { getRequest, Guard } from "@akanjs/nest";
import type { Account } from "@akanjs/signal";
import { ExecutionContext } from "@nestjs/common";
import { Me, Self } from "@shared/base";

export const allow = (
  account: Account<{ self?: Self; me?: Me }> | null,
  roles: ("user" | "admin" | "superAdmin")[]
) => {
  if (!account) throw new Error("No Authentication Account");

  for (const role of roles) {
    if (role === "user" && !account.self?.removedAt && account.self?.roles.includes("user")) return true;
    else if (role === "admin" && !account.me?.removedAt && account.me?.roles.includes("admin")) return true;
    else if (role === "superAdmin" && !account.me?.removedAt && account.me?.roles.includes("superAdmin")) return true;
  }
  throw new Error(
    `No Authentication With Roles: ${roles.join(", ")}, Your roles are ${[
      ...(account.self?.roles ?? []),
      ...(account.me?.roles ?? []),
    ].join(", ")}${!account.self?.roles.length && !account.me?.roles.length ? " (No Roles)" : ""}`
  );
};

export class Every implements Guard {
  static name = "Every";
  canActivate(context: ExecutionContext): boolean {
    const { account } = getRequest(context) as { account: Account };
    return allow(account, ["user", "admin", "superAdmin"]);
  }
}

export class Owner implements Guard {
  static name = "Owner";
  canActivate(context: ExecutionContext): boolean {
    const { account } = getRequest(context) as { account: Account };
    return allow(account, ["user", "admin", "superAdmin"]);
  }
}

export class Admin implements Guard {
  static name = "Admin";
  canActivate(context: ExecutionContext): boolean {
    const { account } = getRequest(context) as { account: Account };
    return allow(account, ["admin", "superAdmin"]);
  }
}

export class SuperAdmin implements Guard {
  static name = "SuperAdmin";
  canActivate(context: ExecutionContext): boolean {
    const { account } = getRequest(context) as { account: Account };
    return allow(account, ["superAdmin"]);
  }
}

export class User implements Guard {
  static name = "User";
  canActivate(context: ExecutionContext): boolean {
    const { account } = getRequest(context) as { account: Account };
    return allow(account, ["user"]);
  }
}
