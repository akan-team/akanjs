import { clsx } from "@akanjs/client";
import { Image } from "@akanjs/ui";
import { cnst, usePage, User } from "@shared/client";
import { Icon } from "@util/ui";

interface UserViewProps {
  className?: string;
  user: cnst.User;
  siteKey?: string;
}
export const General = ({ className, user, siteKey }: UserViewProps) => {
  const { l } = usePage();
  return (
    <div className={clsx(`flex flex-col gap-2`, className)}>
      {user.accountId?.length ? (
        <div>
          <div className="font-bold">{l("user.accountId")}</div>
          <p className="text-base">{user.accountId}</p>
        </div>
      ) : null}
      {user.verifies.includes("password") ? (
        <div>
          <div className="font-bold">{l("user.password")}</div>
          <p className="text-base">
            ********{" "}
            {user.verifies.includes("phone") ? (
              <User.Util.SetPasswordWithPhone />
            ) : siteKey ? (
              <User.Util.ChangePassword siteKey={siteKey} />
            ) : null}
          </p>
        </div>
      ) : null}
      {user.phone?.length ? (
        <div>
          <div className="text-2xl font-bold">{l("user.phone")}</div>
          <p className="pt-2 pl-2 text-lg">{user.phone}</p>
        </div>
      ) : null}
    </div>
  );
};

interface DiscordProps {
  className?: string;
  user: cnst.User;
  imageUrl?: string;
  joinUrl: string;
}
export const Discord = ({ className, imageUrl, joinUrl, user }: DiscordProps) => {
  return user.discord ? (
    <div className={className}>
      <div className="flex items-center">
        <Icon.Discord className="fill-[#5865F2]" width="40" />
        <p className="ml-2 text-2xl">Discord</p>
      </div>
      <div className="rounded-2xl border border-slate-200 p-4 text-center">
        <div className="flex items-center space-x-4">
          {imageUrl ? (
            <div className="flex size-14 items-center justify-center rounded-full bg-slate-600">
              <Image src={imageUrl} width={32} height={32} />
            </div>
          ) : null}
          <div className="">{user.discord.nickname ?? user.discord.user?.username}</div>
        </div>
      </div>
    </div>
  ) : (
    <div className={className}>
      <div className="-mb-4 flex items-center">
        <Icon.Discord className="mb-5 fill-gray-500" viewBox="0 0 50 50" width={40} />
        <p className="ml-2 text-2xl text-gray-500">Discord</p>
      </div>
      <div className="rounded-2xl border border-gray-500 p-4 text-center">
        <div className="mb-1 flex flex-col">
          <p className="mb-2 text-2xl font-light text-gray-400">Not Connected</p>
          <p className="text-x mb-4 font-light whitespace-pre text-gray-400">
            Join our Discord and
            <br />
            link your Discord account!
          </p>
        </div>
        <a
          href={joinUrl}
          target="_blank"
          rel="noreferrer"
          className="block drop-shadow-xl transition md:hover:translate-y-px"
        >
          <Image src="/libs/shared/discord/join_light.png" width={218} height={70} />
        </a>
      </div>
    </div>
  );
};
