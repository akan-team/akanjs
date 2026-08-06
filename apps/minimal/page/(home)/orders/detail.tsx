import { appCard, appNavClass, iconTileRecipe, Screen } from "@apps/minimal/ui";
import type { PageConfig } from "akanjs/client";
import { buttonRecipe, Layout, Link } from "akanjs/ui";
import { AiOutlineArrowLeft, AiOutlineShoppingCart } from "react-icons/ai";

export default function Page() {
  return (
    <Screen className="pb-8">
      <Layout.Navbar className={appNavClass} back right={<div className="font-semibold">Order detail</div>} />
      <div className="px-5 pt-5">
        <section className="rounded-4xl bg-linear-to-br from-primary via-secondary to-accent p-px shadow-2xl shadow-primary/20">
          <div className="rounded-4xl bg-muted/95 p-5">
            <div className={iconTileRecipe({ size: "xl" })}>
              <AiOutlineShoppingCart />
            </div>
            <p className="mt-5 text-primary text-sm">Deep link exception</p>
            <h1 className="mt-1 font-bold text-3xl tracking-tight">Order #AK-8283</h1>
            <p className="mt-3 text-foreground/50 text-sm leading-6">
              This route intentionally exists without a parent `/orders` page, so a deep-link stack resolver must skip
              missing intermediate routes.
            </p>
          </div>
        </section>
        <section className={appCard(undefined, "mt-5 rounded-[1.75rem] p-5")}>
          <p className="text-foreground/50 text-xs uppercase tracking-[0.24em]">Expected local deep link</p>
          <p className="mt-2 break-all font-mono text-sm">http://localhost:8283/orders/detail</p>
        </section>
        <Link className={buttonRecipe({ variant: "outline" }, "mt-5 w-full rounded-2xl")} href="/explore">
          <AiOutlineArrowLeft /> Back to Explore
        </Link>
      </div>
    </Screen>
  );
}

export const pageConfig = { topInset: 48, transition: "scaleOut" } satisfies PageConfig;
