import { appCard, appNavClass, iconTileRecipe, Screen } from "@apps/minimal/ui";
import type { PageConfig } from "akanjs/client";
import { cn } from "akanjs/client";
import { Layout, Link } from "akanjs/ui";
import { AiOutlineCreditCard, AiOutlineFileText, AiOutlineRight, AiOutlineUser } from "react-icons/ai";

export default function Page() {
  return (
    <Screen className="px-5 pb-28">
      <Layout.TopInset className={cn(appNavClass, "flex items-center px-5")} estimatedHeight={pageConfig.topInset}>
        <div className="flex w-full items-center justify-between">
          <div>
            <p className="text-foreground/40 text-xs uppercase tracking-[0.24em]">Account</p>
            <h2 className="font-semibold text-xl">Profile</h2>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <AiOutlineUser />
          </div>
        </div>
      </Layout.TopInset>
      <section className="pt-5">
        <div className="rounded-[2rem] bg-gradient-to-br from-primary to-secondary p-5 text-primary-foreground">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary-foreground/20 text-2xl">
              <AiOutlineUser />
            </div>
            <div>
              <p className="text-primary-foreground/60 text-sm">Welcome back</p>
              <h3 className="font-bold text-2xl">Seon Guest</h3>
            </div>
          </div>
        </div>
        <div className={appCard(undefined, "mt-5 overflow-hidden rounded-[1.75rem]")}>
          {[
            ["/profile/self", "My profile", "Manage your details and preferences", <AiOutlineUser key="user" />],
            [
              "/profile/payments",
              "Payments",
              "Payment methods and billing history",
              <AiOutlineCreditCard key="credit-card" />,
            ],
            ["/profile/legal", "Legal info", "Terms and privacy information", <AiOutlineFileText key="file-text" />],
          ].map(([href, title, desc, icon]) => (
            <Link
              className="flex items-center gap-3 border-foreground/10 border-b p-4 last:border-b-0"
              href={href as string}
              key={href as string}
            >
              <div className={iconTileRecipe()}>{icon}</div>
              <div className="flex-1">
                <p className="font-semibold">{title}</p>
                <p className="text-foreground/50 text-sm">{desc}</p>
              </div>
              <AiOutlineRight className="text-foreground/40" />
            </Link>
          ))}
        </div>
      </section>
    </Screen>
  );
}
export const pageConfig = { topInset: 72 } satisfies PageConfig;
