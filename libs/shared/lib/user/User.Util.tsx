"use client";
import { st, usePage } from "@libs/shared/client";
import { Auth, Field } from "@libs/shared/ui";
import { buttonRecipe } from "@libs/util/ui";
import { usePushNotification } from "@libs/util/webkit";
import { cn } from "akanjs/client";
import { formatPhone, isEmail, isPhoneNumber } from "akanjs/common";
import { Input, Link, Popconfirm, Switch } from "akanjs/ui";
import { type ReactNode, useEffect, useState } from "react";
import { AiOutlineClose, AiOutlineEdit, AiOutlineSave } from "react-icons/ai";

export {
  Activate,
  ChangePassword,
  PhoneSignRoute,
  ResendEmailCodeInPrepareUser,
  ResendPhoneCodeForSetPhoneInPrepareUser,
  ResendPhoneCodeForSignin,
  SigninWithPhoneCode,
  VerifyEmailInPrepareUser,
  VerifyPhoneInPrepareUser,
} from "../_sign/Sign.Util";
export { ForgotPassword, SetPasswordWithPhone, SignInPassword, SSOButtons } from "../_sign/Sign.Zone";

interface SignoutProps {
  className?: string;
  href?: string;
  children: ReactNode;
}
export const Signout = ({ className, href, children }: SignoutProps) => {
  st.tool("signout", { confirm: true })
    .desc("Sign out of this account.")
    .exec(() => st.do.logout());
  return (
    <Link className={className} href={href} onClick={() => void st.do.logout()}>
      {children}
    </Link>
  );
};

export const TokenRefresh = () => <Auth.TokenRefresh scope="user" onRefresh={() => st.do.refreshUserSession()} />;

interface PushNotificationSwitchProps {
  className?: string;
}

export const PushNotificationSwitch = ({ className }: PushNotificationSwitchProps) => {
  const pushNotification = usePushNotification();
  const deviceToken = st.use.deviceToken();
  const pushRegistered = st.use.pushRegistered();
  const checked = pushRegistered === true;

  // The token list is on a secret field, so the switch cannot read its own state off `self` — it asks the
  // server once for this one device.
  useEffect(() => {
    const load = async () => {
      const permission = await pushNotification.getPermission();
      const pushToken = permission === "granted" ? await pushNotification.getToken() : undefined;
      await st.do.loadPushState(pushToken?.token ?? null, permission);
    };
    void load();
  }, []);

  const toggle = async (on: boolean) => {
    if (!on) {
      if (deviceToken) await st.do.unregisterPushToken(deviceToken);
      return;
    }
    const pushToken = await pushNotification.register();
    if (!pushToken) {
      await st.do.loadPushState(null, await pushNotification.getPermission());
      return;
    }
    await st.do.registerPushToken(pushToken);
  };

  st.tool("setPushNotification", {
    guard: ({ on }) => (on === checked ? `Already ${on ? "on" : "off"}.` : true),
  })
    .desc("Turn push notifications on or off for this device.")
    .arg("on", Boolean)
    .exec(toggle);
  return (
    <div className={className}>
      <Switch checked={checked} onChange={toggle} />
    </div>
  );
};

interface SetAccountIdByAdminProps {
  className?: string;
  accountId: string | null;
}
export const SetAccountIdByAdmin = ({ className, accountId }: SetAccountIdByAdminProps) => {
  const { l } = usePage();
  const [changeId, setChangeId] = useState(accountId ?? "empty");
  const [editState, setEditState] = useState<"edit" | "saving" | null>(null);
  const invalid =
    changeId === accountId || changeId.length < 4 || (isEmail(accountId) && !isEmail(changeId))
      ? l("user.setAccountIdByAdminInvalid")
      : null;
  st.tool("setAccountIdByAdmin", {
    confirm: "Change the sign-in id of this account?",
    guard: ({ accountId: next }) =>
      typeof next !== "string" || next.length < 4
        ? "An account id is at least four characters."
        : isEmail(accountId) && !isEmail(next)
          ? "This account signs in with an email, so the new id has to be an email too."
          : true,
  })
    .desc("Change the account id this user signs in with.")
    .arg("accountId", String)
    .exec(async (next) => {
      await st.do.setAccountIdByAdmin(next);
      setChangeId(next);
    });
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="w-24">{l("user.accountId")}</span>
      <Input
        value={changeId}
        onChange={setChangeId}
        disabled={!editState}
        validate={() => invalid ?? true}
        onPressEnter={() => {
          if (invalid || editState !== "edit") return;
          void st.do.setAccountIdByAdmin(changeId);
          setEditState(null);
        }}
      />
      {editState ? (
        <>
          <button
            type="button"
            className={buttonRecipe({ variant: "primary" })}
            disabled={editState === "saving" || !!invalid}
            onClick={async () => {
              setEditState("saving");
              await st.do.setAccountIdByAdmin(changeId);
              setEditState(null);
            }}
          >
            <AiOutlineSave />
          </button>
          <button
            type="button"
            className={buttonRecipe({ variant: "outline" })}
            disabled={editState === "saving"}
            onClick={() => {
              setChangeId(accountId ?? "");
              setEditState(null);
            }}
          >
            <AiOutlineClose />
          </button>
        </>
      ) : (
        <button
          type="button"
          className={buttonRecipe({ variant: "default" })}
          onClick={() => {
            setEditState("edit");
          }}
        >
          <AiOutlineEdit />
        </button>
      )}
    </div>
  );
};

interface SetPasswordByAdminProps {
  className?: string;
}
// XXX: no tool here. Every other admin edit on this screen changes what an account *is*; overwriting its
// password changes who can *be* it, with no notice to the person who owns it. That is account takeover, so it
// stays a thing an operator does by hand.
export const SetPasswordByAdmin = ({ className }: SetPasswordByAdminProps) => {
  const { l } = usePage();
  const [password, setPassword] = useState("");
  const [editState, setEditState] = useState<"edit" | "saving" | null>(null);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="w-24">{l("user.password")}</span>
      <Input.Password
        value={password}
        onChange={setPassword}
        placeholder="********"
        disabled={!editState}
        validate={(value: string) =>
          value.length < 8 || value.length > 20 ? l("user.setPasswordByAdminInvalid") : true
        }
      />
      {editState ? (
        <>
          <button
            type="button"
            className={buttonRecipe({ variant: "primary" })}
            disabled={editState === "saving" || password.length < 8 || password.length > 20}
            onClick={async () => {
              setEditState("saving");
              try {
                await st.do.setPasswordByAdmin(password);
                setPassword("");
              } finally {
                setEditState(null);
              }
            }}
          >
            <AiOutlineSave />
          </button>
          <button
            type="button"
            className={buttonRecipe({ variant: "outline" })}
            disabled={editState === "saving"}
            onClick={() => {
              setPassword("");
              setEditState(null);
            }}
          >
            <AiOutlineClose />
          </button>
        </>
      ) : (
        <button
          type="button"
          className={buttonRecipe({ variant: "default" })}
          onClick={() => {
            setEditState("edit");
          }}
        >
          <AiOutlineEdit />
        </button>
      )}
    </div>
  );
};

interface SetPhoneByAdminProps {
  className?: string;
  phone: string | null;
}
export const SetPhoneByAdmin = ({ className, phone }: SetPhoneByAdminProps) => {
  const { l } = usePage();
  const [changePhone, setChangePhone] = useState(phone ?? "empty");
  const [editState, setEditState] = useState<"edit" | "saving" | null>(null);
  st.tool("setPhoneByAdmin", {
    confirm: "Change the verified phone number of this account?",
    guard: ({ phone: next }) =>
      typeof next !== "string" || !isPhoneNumber(formatPhone(next))
        ? "That is not a phone number this account can verify with."
        : true,
  })
    .desc("Change the phone number this user verifies with.")
    .arg("phone", String)
    .exec(async (next) => {
      const formatted = formatPhone(next);
      await st.do.setPhoneByAdmin(formatted);
      setChangePhone(formatted);
    });
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="w-24">{l("user.phone")}</span>
      <Input
        value={changePhone}
        onChange={(value) => {
          setChangePhone(formatPhone(value));
        }}
        disabled={!editState}
        validate={(value: string) => isPhoneNumber(value) || l("user.setPhoneByAdminInvalid")}
      />
      {editState ? (
        <>
          <button
            type="button"
            className={buttonRecipe({ variant: "primary" })}
            disabled={editState === "saving" || !isPhoneNumber(changePhone) || changePhone === phone}
            onClick={async () => {
              setEditState("saving");
              await st.do.setPhoneByAdmin(changePhone);
              setEditState(null);
            }}
          >
            <AiOutlineSave />
          </button>
          <button
            type="button"
            className={buttonRecipe({ variant: "outline" })}
            disabled={editState === "saving"}
            onClick={() => {
              setChangePhone(phone ?? "");
              setEditState(null);
            }}
          >
            <AiOutlineClose />
          </button>
        </>
      ) : (
        <button
          type="button"
          className={buttonRecipe({ variant: "default" })}
          onClick={() => {
            setEditState("edit");
          }}
        >
          <AiOutlineEdit />
        </button>
      )}
    </div>
  );
};

interface VerifyEmailProps {
  className?: string;
}
export const VerifyEmail = ({ className }: VerifyEmailProps) => {
  const { l } = usePage();
  const emailToVerify = st.use.emailToVerify();
  const emailToVerifyCode = st.use.emailToVerifyCode();
  const emailToVerifySentTo = st.use.emailToVerifySentTo();
  const isSent = !!emailToVerifySentTo && emailToVerifySentTo === emailToVerify;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-start gap-2">
        <Field.Email
          className="min-w-0 flex-1"
          nullable
          placeholder={l("user.emailPlaceholder")}
          value={emailToVerify}
          onChange={st.do.setEmailToVerify}
        />
        <button
          type="button"
          className={buttonRecipe({ variant: isSent ? "default" : "primary" }, "whitespace-nowrap")}
          disabled={!isEmail(emailToVerify)}
          onClick={() => void st.do.requestEmailCodeInActiveUser()}
        >
          {isSent ? l("user.resendEmailCode") : l("user.sendEmailCode")}
        </button>
      </div>
      {isSent ? (
        <div className="flex items-start gap-2">
          <Field.Text
            className="min-w-0 flex-1"
            minlength={6}
            maxlength={6}
            placeholder={l("user.verifyEmailCodePlaceholder")}
            value={emailToVerifyCode}
            onChange={st.do.setEmailToVerifyCode}
          />
          <button
            type="button"
            className={buttonRecipe({ variant: "primary" }, "whitespace-nowrap")}
            disabled={emailToVerifyCode.length !== 6}
            onClick={() => void st.do.verifyEmailInActiveUser()}
          >
            {l("user.verifyEmailSubmit")}
          </button>
        </div>
      ) : null}
    </div>
  );
};

interface RemoveVerifiedEmailProps {
  className?: string;
  email: string;
}
export const RemoveVerifiedEmail = ({ className, email }: RemoveVerifiedEmailProps) => {
  const { l } = usePage();
  return (
    <Popconfirm
      title={l("user.removeVerifiedEmailConfirm", { email })}
      description={l("user.removeVerifiedEmailConfirmDesc")}
      okText={l("user.removeVerifiedEmail")}
      onConfirm={() => void st.do.removeVerifiedEmailOfSelf(email)}
      triggerClassName={buttonRecipe({ variant: "ghost", size: "sm" }, className)}
    >
      {l("user.removeVerifiedEmail")}
    </Popconfirm>
  );
};
