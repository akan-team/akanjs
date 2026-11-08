import { type cnst, usePage } from "@libs/shared/client";
import { buttonRecipe, Icon } from "@libs/util/ui";
import type { ReactNode } from "react";
import { AiFillGithub } from "react-icons/ai";

interface SsoMainButtonProps {
  ssoType: cnst.SsoType["value"];
}
export const SsoMainButton = ({ ssoType }: SsoMainButtonProps) => {
  const { l } = usePage();
  const buttonOf: { [key in cnst.SsoType["value"]]: ReactNode } = {
    kakao: (
      <button
        type="button"
        className={buttonRecipe(
          { variant: "default" },
          "relative flex w-full items-center border-none bg-[var(--kakao)] text-[var(--kakao-ink)] shadow-sm hover:bg-[var(--kakao)] hover:opacity-50",
        )}
      >
        <Icon.Kakao className="absolute left-4 rounded-full" />
        {l("user.signWithKakao")}
      </button>
    ),
    naver: (
      <button
        type="button"
        className={buttonRecipe(
          { variant: "default" },
          "relative flex w-full items-center border-none bg-[var(--naver)] text-white shadow-sm hover:bg-[var(--naver)] hover:opacity-50",
        )}
      >
        <Icon.Naver className="absolute left-4 rounded-full fill-white" />
        {l("user.signWithNaver")}
      </button>
    ),
    github: (
      <button
        type="button"
        className={buttonRecipe(
          { variant: "default" },
          "relative flex w-full items-center border-none bg-black text-white shadow-sm",
        )}
      >
        <AiFillGithub className="absolute left-[18px] text-4xl text-white" />
        {l("user.signWithGithub")}
      </button>
    ),
    google: (
      <button
        type="button"
        className={buttonRecipe(
          { variant: "default" },
          "relative flex w-full items-center border border-border bg-white text-black shadow-sm",
        )}
      >
        <Icon.Google className="absolute left-4 rounded-full" />
        {l("user.signWithGoogle")}
      </button>
    ),
    facebook: (
      <button
        type="button"
        className={buttonRecipe(
          { variant: "default" },
          "relative flex w-full items-center border-none bg-[var(--telegram)] text-white shadow-sm",
        )}
      >
        <Icon.Facebook className="absolute left-[22px] rounded-full" width={30} />
        {l("user.signWithFacebook")}
      </button>
    ),
    apple: (
      <button
        type="button"
        className={buttonRecipe(
          { variant: "default" },
          "relative flex w-full items-center border-none bg-black text-white shadow-sm",
        )}
      >
        <Icon.Apple className="absolute left-4 rounded-full" />
        {l("user.signWithApple")}
      </button>
    ),
  };
  return buttonOf[ssoType];
};

interface SsoSubButtonProps {
  ssoType: cnst.SsoType["value"];
}
export const SsoSubButton = ({ ssoType }: SsoSubButtonProps) => {
  const buttonOf: { [key in cnst.SsoType["value"]]: ReactNode } = {
    kakao: (
      <button
        type="button"
        className="relative flex size-14 items-center justify-center rounded-full bg-[var(--kakao)] hover:bg-[var(--kakao)] hover:opacity-50"
      >
        <Icon.Kakao className="" />
      </button>
    ),
    naver: (
      <button
        type="button"
        className="relative flex size-14 items-center justify-center rounded-full bg-[var(--naver)] hover:bg-[var(--naver)] hover:opacity-50"
      >
        <Icon.Naver className="fill-white" />
      </button>
    ),
    github: (
      <button
        type="button"
        className="relative flex size-14 items-center justify-center rounded-full bg-black text-black"
      >
        <div className="flex size-10 items-center justify-center rounded-full bg-white">
          <AiFillGithub className="scale-125 text-[200px]" />
        </div>
      </button>
    ),
    google: (
      <button
        type="button"
        className="relative flex size-14 items-center justify-center rounded-full bg-white shadow-md"
      >
        <Icon.Google className="" />
      </button>
    ),
    facebook: (
      <button
        type="button"
        className="relative flex size-14 items-center justify-center rounded-full bg-[var(--facebook)]"
      >
        <Icon.Facebook className="mr-[0.5px] mb-1 fill-transparent" />
      </button>
    ),
    apple: (
      <button type="button" className="relative flex size-14 items-center justify-center rounded-full bg-black">
        <Icon.Apple className="fill-white" />
      </button>
    ),
  };
  return buttonOf[ssoType];
};
