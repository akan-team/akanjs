import type { Guard, GuardScope, SignalContext } from "akanjs/signal";
import { Err } from "../lib/dict";
import type * as srv from "../lib/srv";
import { isAgentCall } from "./agentCall";
import { accountOf, hasRole, isAdmin, isPlatformAdmin, isStaff } from "./callerAccount";
import { allow } from "./guards.helper";
import { SignupToken } from "./signupToken";

//? Every guard keeps `static name`: fetch serializes guards by it and the API explorer filters on it, and a minified
//? class name would break both.

// Without it, an anonymous caller reaches endpoints that act on "the signed-in account".
export class Every implements Guard {
  static name = "Every";
  static scope: GuardScope = "account";
  canPass(context: SignalContext): boolean {
    return allow(context, accountOf(context), ["user", "admin", "superAdmin"]);
  }
}

// Without it, a viewer, a manager or a role-less admin runs console operations that change other people's data.
export class Admin implements Guard {
  static name = "Admin";
  static scope: GuardScope = "account";
  canPass(context: SignalContext): boolean {
    return allow(context, accountOf(context), ["admin", "superAdmin"]);
  }
}

// Without it, every office console admin also reads every tenant's builds, logs and backups and reseals platform keys.
export class PlatformAdmin implements Guard {
  static name = "PlatformAdmin";
  static scope: GuardScope = "account";
  canPass(context: SignalContext): boolean {
    const account = accountOf(context);
    allow(context, account, ["admin", "superAdmin"]);
    if (isPlatformAdmin(account)) return true;
    throw new Err("shared.error.notPlatformAdmin", { key: context.key }, { statusCode: 403 });
  }
}

// Any admin role, viewer included. Without it, an end user or an admin stripped of every role reads console data.
export class Staff implements Guard {
  static name = "Staff";
  static scope: GuardScope = "account";
  canPass(context: SignalContext): boolean {
    return allow(context, accountOf(context), ["viewer", "manager", "admin", "superAdmin"]);
  }
}

// Without it, an ordinary admin grants roles and runs raw SQL.
export class SuperAdmin implements Guard {
  static name = "SuperAdmin";
  static scope: GuardScope = "account";
  canPass(context: SignalContext): boolean {
    return allow(context, accountOf(context), ["superAdmin"]);
  }
}

// Without it, an admin session with no user identity reaches endpoints that read `Self`.
export class User implements Guard {
  static name = "User";
  static scope: GuardScope = "account";
  canPass(context: SignalContext): boolean {
    return allow(context, accountOf(context), ["user"]);
  }
}

// `userId` is the caller, or the caller is an admin. Without it, another user, a viewer or a manager rewrites it.
export class SelfOrAdmin implements Guard {
  static name = "SelfOrAdmin";
  static scope: GuardScope = "resource";
  canPass(context: SignalContext): boolean {
    const account = accountOf(context);
    const userId = context.getArg("userId");
    if (!userId) return false;
    return (hasRole(account, "user") && account?.self?.id === userId) || isAdmin(account);
  }
}

// A user's `image`/`images` name only files that user uploaded; an admin sets any. Without it, a user shows a File id
// guessed or read off someone else's page as their own photo.
export class OwnImages implements Guard {
  static name = "OwnImages";
  static scope: GuardScope = "resource";
  async canPass(context: SignalContext): Promise<boolean> {
    const account = accountOf(context);
    if (isAdmin(account)) return true;
    const userId = context.getArg<string>("userId");
    const selfId = account?.self?.id;
    if (!userId || !selfId) return false;
    const data = context.getArg<{ image?: unknown; images?: unknown } | null>("data");
    const images = Array.isArray(data?.images) ? (data.images as unknown[]) : [];
    const fileIds = [data?.image, ...images].map(OwnImages.#idOf).filter((id): id is string => !!id);
    if (!fileIds.length) return true;
    let isOwn = false;
    try {
      isOwn = await context.getService<srv.UserService>("user").canSetImages(userId, selfId, fileIds);
    } catch (error) {
      context.adaptor.logger.warn(`Guard denied ${context.key}: ${String(error)}`);
      return false;
    }
    if (!isOwn) throw new Err("user.error.imageNotUploadedBySelf", undefined, { statusCode: 403 });
    return true;
  }
  static #idOf(ref: unknown) {
    return typeof ref === "string" ? ref : ((ref as { id?: string } | null | undefined)?.id ?? null);
  }
}

// `userId` is the caller, or the caller is staff — reads only. Without it, one user reads another's account.
export class SelfOrStaff implements Guard {
  static name = "SelfOrStaff";
  static scope: GuardScope = "resource";
  canPass(context: SignalContext): boolean {
    const account = accountOf(context);
    const userId = context.getArg("userId");
    if (!userId) return false;
    return (hasRole(account, "user") && account?.self?.id === userId) || isStaff(account);
  }
}

// The caller holds the signup token of the prepare user named by `userId`. A prepare user has no session, and its
// id travels in URLs and logs; without this, anyone holding the id fills in the draft and activates the account.
export class SignupHolder implements Guard {
  static name = "SignupHolder";
  static scope: GuardScope = "resource";
  async canPass(context: SignalContext): Promise<boolean> {
    const holderId = await SignupToken.userIdOf(context);
    if (!holderId) return false;
    const userId = context.getArg("userId");
    return userId === undefined || userId === null || userId === holderId;
  }
}

/**
 * Passes a person and refuses a model — an MCP call, or any call on an agent's token. `agents = false` is what takes
 * the endpoint out of the MCP catalogue document itself; `account` scope is what refuses the call should one still
 * arrive. It says nothing about who the person is, so it rides beside a role guard: `guards: [Every, Person]`.
 */
export class Person implements Guard {
  static name = "Person";
  static scope: GuardScope = "account";
  static agents = false;
  canPass(context: SignalContext): boolean {
    return !isAgentCall(context);
  }
}
