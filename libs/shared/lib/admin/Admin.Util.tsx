"use client";
import { type cnst, st, usePage } from "@libs/shared/client";
import { Icon } from "@libs/util/ui";
import { clsx, fetch } from "akanjs/client";
// import { client } from "akanjs/signal";
import { Input, Link, Modal } from "akanjs/ui";
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
      <button className="btn relative flex w-full items-center border-none bg-black text-white shadow-sm">
        <AiFillGithub className="absolute left-[18px] text-4xl text-white" />
        {l("user.signWithGithub")}
      </button>
    ),
    google: (
      <button className="btn relative flex w-full items-center border border-gray-200 bg-white text-black shadow-sm">
        <Icon.Google className="absolute left-4 rounded-full" />
        {l("user.signWithGoogle")}
      </button>
    ),
    facebook: (
      <button className="btn relative flex w-full items-center border-none bg-[#039be5] text-white shadow-sm">
        <Icon.Facebook className="absolute left-[22px] rounded-full" width={30} />
        {l("user.signWithFacebook")}
      </button>
    ),
    apple: (
      <button className="btn relative flex w-full items-center border-none bg-black text-white shadow-sm">
        <Icon.Apple className="absolute left-4 rounded-full" />
        {l("user.signWithApple")}
      </button>
    ),
    kakao: (
      <button className="btn relative flex w-full items-center border-none bg-[#FEE500] text-[#3c1e1e] shadow-sm hover:text-white">
        <Icon.Kakao className="absolute left-4 rounded-full" />
        {l("user.signWithKakao")}
      </button>
    ),
    naver: (
      <button className="btn relative flex w-full items-center border-none bg-[#1ec800] text-white shadow-sm hover:text-white">
        <Icon.Naver className="absolute left-4 rounded-full fill-white" />
        {l("user.signWithNaver")}
      </button>
    ),
  };
  const ssos = ssoTypes.filter((ssoType) => !!ssoButtons[ssoType]);
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex w-96 flex-col gap-4 rounded-2xl border border-base-100/30 bg-base-200 p-8 shadow-sm">
        <div className="text-center">Admin System</div>
        {logo ? <div className="mb-4 text-center">{logo} </div> : null}
        {password && (
          <>
            <div className="flex w-full justify-center gap-1">
              <div className="w-24 text-center">Account: </div>
              <Input
                className="text-base-content"
                value={adminForm.accountId}
                onChange={st.do.setAccountIdOnAdmin}
                validate={(value) => value.length > 0}
              />
            </div>
            <div className="flex w-full justify-center gap-1">
              <div className="w-24 text-center">Password: </div>
              <Input.Password
                className="text-base-content"
                value={adminForm.password ?? ""}
                onChange={st.do.setPasswordOnAdmin}
                validate={(value) => value.length > 0}
              />
            </div>
            <button
              className="btn btn-primary w-full"
              onKeyDown={(e) => {
                if (e.key === "Enter") void st.do.signinAdmin({ redirect });
              }}
              onClick={() => void st.do.signinAdmin({ redirect })}
            >
              {l("shared.signin")}
            </button>
          </>
        )}
        {ssos.map((sso) => (
          <Link href={`${fetch.origin}/user/${sso}`} key={sso}>
            {ssoButtons[sso]}
          </Link>
        ))}
      </div>
    </div>
  );
};

export const ToolMenu = () => {
  return (
    <div className="dropdown dropdown-end">
      <label tabIndex={0} className="btn btn-ghost m-1">
        <AiOutlineMenu className="mt-0.5" />
      </label>
      <ul tabIndex={0} className="dropdown-content menu z-[1] w-32 rounded-box bg-base-100 p-2 shadow-sm">
        <li onClick={() => void st.do.signoutAdmin()}>
          <div className="flex items-center gap-2 text-base-content">
            <AiOutlinePoweroff className="mt-0.5" /> Logout
          </div>
        </li>
      </ul>
    </div>
  );
};

interface ManageAdminRoleProps {
  id: string;
  roles: cnst.AdminRole["value"][];
}
export const ManageAdminRole = ({ id, roles }: ManageAdminRoleProps) => {
  if (roles.includes("admin"))
    return (
      <button className="btn btn-sm btn-error w-full" onClick={() => void st.do.subAdminRole(id, "admin")}>
        Remove Admin
      </button>
    );
  else
    return (
      <button className="btn btn-sm btn-warning w-full" onClick={() => void st.do.addAdminRole(id, "admin")}>
        Add Admin
      </button>
    );
};

interface ManageSuperAdminRoleProps {
  id: string;
  roles: cnst.AdminRole["value"][];
}
export const ManageSuperAdminRole = ({ id, roles }: ManageSuperAdminRoleProps) => {
  if (roles.includes("superAdmin"))
    return (
      <button className="btn btn-sm btn-error w-full" onClick={() => void st.do.subAdminRole(id, "superAdmin")}>
        Remove SuperAdmin
      </button>
    );
  else
    return (
      <button className="btn btn-sm btn-warning w-full" onClick={() => void st.do.addAdminRole(id, "superAdmin")}>
        Add SuperAdmin
      </button>
    );
};

interface SetPasswordProps {
  className?: string;
  id: string;
}
export const SetPassword = ({ className, id }: SetPasswordProps) => {
  const [passwordState, setPasswordState] = useState({ modalOpen: false, password: "" });

  return (
    <>
      <button
        className={clsx("btn btn-sm", className)}
        onClick={() => {
          setPasswordState({ modalOpen: true, password: "" });
        }}
      >
        Set Password
      </button>
      <Modal
        open={passwordState.modalOpen}
        onCancel={() => {
          setPasswordState({ modalOpen: false, password: "" });
        }}
        action={
          <button
            className="btn btn-primary"
            onClick={async () => {
              await st.do.setAdminPassword(id, passwordState.password);
              setPasswordState({ modalOpen: false, password: "" });
            }}
          >
            Submit
          </button>
        }
      >
        <Input.Password
          value={passwordState.password}
          onChange={(password) => {
            setPasswordState({ modalOpen: passwordState.modalOpen, password: password });
          }}
          validate={(password) => {
            if (password.length < 8) return "it requires at least 8 characters";
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
  return (
    <Link className={className} href={href} onClick={() => void st.do.signoutAdmin()}>
      {children}
    </Link>
  );
};
