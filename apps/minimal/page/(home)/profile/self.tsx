import { appCard, appNavClass, iconTileRecipe, Screen } from "@apps/minimal/ui";
import type { PageConfig } from "akanjs/client";
import { buttonRecipe, Layout, Link } from "akanjs/ui";
import { AiOutlineEdit, AiOutlineMail, AiOutlinePhone, AiOutlineUser } from "react-icons/ai";

export default function Page() {
  return (
    <Screen className="px-5 pb-8">
      <Layout.Navbar className={appNavClass} back>
        <div className="font-semibold">My Profile</div>
      </Layout.Navbar>
      <section className="pt-5">
        <div className={appCard(undefined, "rounded-[2rem] p-5 text-center")}>
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-gradient-to-br from-primary to-secondary text-3xl text-primary-foreground">
            <AiOutlineUser />
          </div>
          <h1 className="mt-4 font-bold text-2xl">Seon Guest</h1>
          <p className="text-foreground/50 text-sm">Premium traveler</p>
        </div>
        <div className="mt-5 grid gap-3">
          {[
            [<AiOutlineMail key="email" />, "Email", "guest@seon.app"],
            [<AiOutlinePhone key="phone" />, "Phone", "+82 10-0000-0000"],
          ].map(([icon, label, value]) => (
            <div className={appCard(undefined, "flex items-center gap-3 rounded-3xl p-4")} key={label as string}>
              <div className={iconTileRecipe()}>{icon}</div>
              <div>
                <p className="text-foreground/50 text-sm">{label}</p>
                <p className="font-semibold">{value}</p>
              </div>
            </div>
          ))}
        </div>
        <Link
          className={buttonRecipe({ variant: "primary" }, "mt-5 w-full rounded-2xl border-0")}
          href="/profile/self/edit"
        >
          <AiOutlineEdit /> Edit profile
        </Link>
      </section>
    </Screen>
  );
}
export const pageConfig = { topInset: 48, transition: "stack" } satisfies PageConfig;
