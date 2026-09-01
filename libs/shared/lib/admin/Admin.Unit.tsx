import { Admin, type cnst, usePage } from "@libs/shared/client";
import { badgeRecipe, cardRecipe } from "@libs/util/ui";
import { cn, type ModelProps } from "akanjs/client";
import { Link, RecentTime } from "akanjs/ui";

export const Card = ({ className, admin, href }: ModelProps<"admin", cnst.LightAdmin>) => {
  const { l } = usePage();
  const roleBadgeClass: { [key in cnst.AdminRole["value"]]: string } = {
    manager: badgeRecipe({ variant: "neutral", size: "sm" }),
    admin: badgeRecipe({ variant: "info", size: "sm" }),
    superAdmin: badgeRecipe({ variant: "warning", size: "sm" }),
  };
  const avatarClass: { [key in cnst.AdminRole["value"]]: string } = {
    manager: "bg-muted text-muted-foreground",
    admin: "bg-info/15 text-info",
    superAdmin: "bg-warning/15 text-warning",
  };
  const body = (
    <div
      className={cardRecipe({ surface: "bordered" }, [
        "w-full items-center gap-3 p-5 text-center",
        href && "duration-200 hover:border-primary/30 hover:shadow-md",
        className,
      ])}
    >
      <div
        className={cn(
          "grid size-14 shrink-0 place-items-center rounded-full font-semibold text-lg",
          avatarClass[admin.primaryRole()],
        )}
      >
        {admin.label().slice(0, 1).toUpperCase()}
      </div>
      <div className="w-full min-w-0">
        <div className="truncate font-semibold text-foreground">{admin.label()}</div>
        <div className="truncate text-muted-foreground text-xs">{admin.accountId}</div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {admin.roles.map((role) => (
          <span key={role} className={roleBadgeClass[role]}>
            {l(`adminRole.${role}`)}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs">
        {l("admin.lastLoginAt")}
        <RecentTime date={admin.lastLoginAt} breakUnit="minute" />
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
};

export const Row = ({ className, admin }: ModelProps<"admin", cnst.LightAdmin>) => {
  const { l } = usePage();
  const roleBadgeClass: { [key in cnst.AdminRole["value"]]: string } = {
    manager: badgeRecipe({ variant: "neutral", size: "sm" }),
    admin: badgeRecipe({ variant: "info", size: "sm" }),
    superAdmin: badgeRecipe({ variant: "warning", size: "sm" }),
  };
  const avatarClass: { [key in cnst.AdminRole["value"]]: string } = {
    manager: "bg-muted text-muted-foreground",
    admin: "bg-info/15 text-info",
    superAdmin: "bg-warning/15 text-warning",
  };
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-border border-b px-4 py-4 last:border-b-0 hover:bg-muted/40 md:flex-row md:items-center",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full font-semibold text-sm",
            avatarClass[admin.primaryRole()],
          )}
        >
          {admin.label().slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-sm">{admin.label()}</div>
          <div className="truncate text-muted-foreground text-xs">{admin.accountId}</div>
          <div className="mt-1 flex items-center gap-1.5 text-muted-foreground text-xs">
            {l("admin.lastLoginAt")}
            <RecentTime date={admin.lastLoginAt} breakUnit="minute" />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {admin.roles.map((role) => (
          <span key={role} className={roleBadgeClass[role]}>
            {l(`adminRole.${role}`)}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
        <Admin.Util.ManageAdminRole id={admin.id} roles={admin.roles} />
        <Admin.Util.ManageSuperAdminRole id={admin.id} roles={admin.roles} />
        <Admin.Util.SetPassword id={admin.id} />
      </div>
    </div>
  );
};
