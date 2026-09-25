"use client";
import { type cnst, fetch, st, usePage } from "@libs/shared/client";
import { buttonRecipe, Icon } from "@libs/util/ui";
import { ID } from "akanjs/base";
import { cn } from "akanjs/client";
// import { client } from "akanjs/signal";
import { Dropdown, Input, Link, Modal, System } from "akanjs/ui";
import { type ReactNode, useEffect, useState } from "react";
import { AiFillGithub, AiOutlineMenu, AiOutlinePoweroff } from "react-icons/ai";

interface AuthProps {
  logo?: ReactNode;
  password?: boolean;
  ssoTypes?: cnst.SsoType["value"][];
  redirect?: string;
}
export const Auth = ({ logo, password, ssoTypes = [], redirect }: AuthProps) => {
  const adminForm = st.use.adminForm();
  const { l } = usePage();
  useEffect(() => {
    const handleEnter = (e: KeyboardEvent) => {
      if (e.key === "Enter") void st.do.signinAdmin({ redirect });
    };
    window.addEventListener("keydown", handleEnter);
    return () => {
      window.removeEventListener("keydown", handleEnter);
    };
  }, []);
  const ssoButtons: { [key in cnst.SsoType["value"]]: ReactNode } = {
    github: (
      <button
        className={buttonRecipe(
          { variant: "default" },
          "relative flex h-11 w-full items-center border-none bg-black text-white shadow-sm",
        )}
      >
        <AiFillGithub className="absolute left-[18px] text-4xl text-white" />
        {l("user.signWithGithub")}
      </button>
    ),
    google: (
      <button
        className={buttonRecipe(
          { variant: "default" },
          "relative flex h-11 w-full items-center border border-border bg-white text-black shadow-sm",
        )}
      >
        <Icon.Google className="absolute left-4 rounded-full" />
        {l("user.signWithGoogle")}
      </button>
    ),
    facebook: (
      <button
        className={buttonRecipe(
          { variant: "default" },
          "relative flex h-11 w-full items-center border-none bg-[var(--telegram)] text-white shadow-sm",
        )}
      >
        <Icon.Facebook className="absolute left-[22px] rounded-full" width={30} />
        {l("user.signWithFacebook")}
      </button>
    ),
    apple: (
      <button
        className={buttonRecipe(
          { variant: "default" },
          "relative flex h-11 w-full items-center border-none bg-black text-white shadow-sm",
        )}
      >
        <Icon.Apple className="absolute left-4 rounded-full" />
        {l("user.signWithApple")}
      </button>
    ),
    kakao: (
      <button
        className={buttonRecipe(
          { variant: "default" },
          "relative flex h-11 w-full items-center border-none bg-[var(--kakao)] text-[var(--kakao-ink)] shadow-sm hover:text-white",
        )}
      >
        <Icon.Kakao className="absolute left-4 rounded-full" />
        {l("user.signWithKakao")}
      </button>
    ),
    naver: (
      <button
        className={buttonRecipe(
          { variant: "default" },
          "relative flex h-11 w-full items-center border-none bg-[var(--naver)] text-white shadow-sm hover:text-white",
        )}
      >
        <Icon.Naver className="absolute left-4 rounded-full fill-white" />
        {l("user.signWithNaver")}
      </button>
    ),
  };
  const ssos = ssoTypes.filter((ssoType) => !!ssoButtons[ssoType]);
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black px-4 py-10">
      <div className="pointer-events-none absolute -top-1/3 left-1/2 size-160 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center gap-2">
          {logo ? <div className="flex items-center justify-center text-white">{logo}</div> : null}
          <div className="font-semibold text-lg text-white">{l("admin.modelName")}</div>
          <div className="text-white/40 text-xs">
            {l.trans({ en: "Sign in to continue", ko: "계속하려면 로그인하세요" })}
          </div>
        </div>
        {password ? (
          <div className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="font-medium text-white/50 text-xs">{l("admin.accountId")}</span>
              <Input
                className="w-full text-white/50"
                inputClassName="h-11 border-white/10 bg-white/5 text-white focus:border-white/40"
                value={adminForm.accountId}
                onChange={st.do.setAccountIdOnAdmin}
                validate={(value) => value.length > 0}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-medium text-white/50 text-xs">{l("admin.password")}</span>
              <Input.Password
                className="w-full text-white/50"
                inputClassName="h-11 border-white/10 bg-white/5 text-white focus:border-white/40"
                value={adminForm.password ?? ""}
                onChange={st.do.setPasswordOnAdmin}
                validate={(value) => value.length > 0}
              />
            </label>
            <button
              className="h-11 w-full rounded-field bg-white font-semibold text-black text-sm duration-200 hover:bg-white/85"
              onClick={() => void st.do.signinAdmin({ redirect })}
            >
              {l("shared.signin")}
            </button>
          </div>
        ) : null}
        {password && ssos.length ? (
          <div className="mt-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-white/30 text-xs">{l.trans({ en: "or", ko: "또는" })}</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>
        ) : null}
        {ssos.length ? (
          <div className="mt-6 flex flex-col gap-2.5">
            {ssos.map((sso) => (
              <Link href={`${fetch.origin}/user/${sso}`} key={sso}>
                {ssoButtons[sso]}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

interface ToolMenuProps {
  themes?: string[];
}
// XXX: SetPassword publishes nothing. It writes an admin credential, and a password an agent chose is a
// password nobody told the person — the modal is the only way in.
export const ToolMenu = ({ themes = ["light", "dark"] }: ToolMenuProps) => {
  return (
    <Dropdown
      buttonClassName={buttonRecipe({ variant: "ghost" })}
      dropdownClassName="z-[1] w-32 rounded-box p-2 shadow-sm border border-foreground/10 gap-4 py-4"
      value={<AiOutlineMenu className="mt-0.5" />}
      content={
        <>
          <li className="flex items-center justify-center">
            <System.ThemeToggle themes={themes} />
          </li>
          <li onClick={() => void st.do.signoutAdmin()}>
            <a className="flex cursor-pointer items-center justify-center gap-2 text-foreground">
              <AiOutlinePoweroff className="mt-0.5" /> Logout
            </a>
          </li>
        </>
      }
    />
  );
};

interface ManageAdminRoleProps {
  className?: string;
  id: string;
  roles: cnst.AdminRole["value"][];
}
export const ManageAdminRole = ({ className, id, roles }: ManageAdminRoleProps) => {
  const { l } = usePage();
  st.tool("setAdminRole", { confirm: true })
    .desc("Grant or revoke the admin role for one account.")
    .arg("adminId", ID)
    .arg("granted", Boolean)
    .exec((adminId, granted) =>
      granted ? st.do.addAdminRole(adminId, "admin") : st.do.subAdminRole(adminId, "admin"),
    );
  if (roles.includes("admin"))
    return (
      <button
        className={buttonRecipe({ size: "sm", variant: "outline" }, className)}
        onClick={() => void st.do.subAdminRole(id, "admin")}
      >
        {l("shared.revokeRole", { role: l("adminRole.admin") })}
      </button>
    );
  else
    return (
      <button
        className={buttonRecipe({ size: "sm", variant: "warning" }, className)}
        onClick={() => void st.do.addAdminRole(id, "admin")}
      >
        {l("shared.grantRole", { role: l("adminRole.admin") })}
      </button>
    );
};

interface ManageSuperAdminRoleProps {
  className?: string;
  id: string;
  roles: cnst.AdminRole["value"][];
}
export const ManageSuperAdminRole = ({ className, id, roles }: ManageSuperAdminRoleProps) => {
  const { l } = usePage();
  st.tool("setSuperAdminRole", { confirm: "Change super-admin, the role that can manage every other admin?" })
    .desc("Grant or revoke the super-admin role for one account — the role that can manage every other admin.")
    .arg("adminId", ID)
    .arg("granted", Boolean)
    .exec((adminId, granted) =>
      granted ? st.do.addAdminRole(adminId, "superAdmin") : st.do.subAdminRole(adminId, "superAdmin"),
    );
  if (roles.includes("superAdmin"))
    return (
      <button
        className={buttonRecipe({ size: "sm", variant: "outline" }, className)}
        onClick={() => void st.do.subAdminRole(id, "superAdmin")}
      >
        {l("shared.revokeRole", { role: l("adminRole.superAdmin") })}
      </button>
    );
  else
    return (
      <button
        className={buttonRecipe({ size: "sm", variant: "warning" }, className)}
        onClick={() => void st.do.addAdminRole(id, "superAdmin")}
      >
        {l("shared.grantRole", { role: l("adminRole.superAdmin") })}
      </button>
    );
};

interface SetPasswordProps {
  className?: string;
  id: string;
}
export const SetPassword = ({ className, id }: SetPasswordProps) => {
  const { l } = usePage();
  const [passwordState, setPasswordState] = useState({ modalOpen: false, password: "" });

  return (
    <>
      <button
        className={cn(buttonRecipe({ size: "sm", variant: "default" }), className)}
        onClick={() => {
          setPasswordState({ modalOpen: true, password: "" });
        }}
      >
        {l("shared.setPassword")}
      </button>
      <Modal
        open={passwordState.modalOpen}
        onCancel={() => {
          setPasswordState({ modalOpen: false, password: "" });
        }}
        action={
          <button
            className={buttonRecipe({ variant: "primary" })}
            onClick={async () => {
              await st.do.setAdminPassword(id, passwordState.password);
              setPasswordState({ modalOpen: false, password: "" });
            }}
          >
            {l("shared.submit")}
          </button>
        }
      >
        <Input.Password
          value={passwordState.password}
          onChange={(password) => {
            setPasswordState({ modalOpen: passwordState.modalOpen, password: password });
          }}
          validate={(password) => {
            if (password.length < 8) return l("base.textTooShortError", { minlength: 8 });
            return true;
          }}
        />
      </Modal>
    </>
  );
};

interface SignoutProps {
  className?: string;
  href?: string;
  children: ReactNode;
}
export const Signout = ({ className, href, children }: SignoutProps) => {
  st.tool("signoutAdmin", { confirm: true })
    .desc("Sign out of the admin console.")
    .exec(() => st.do.signoutAdmin());
  return (
    <Link className={className} href={href} onClick={() => void st.do.signoutAdmin()}>
      {children}
    </Link>
  );
};
