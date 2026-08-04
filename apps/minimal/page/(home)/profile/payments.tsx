import { appCard, appNavClass, Screen } from "@apps/minimal/ui";
import type { PageConfig } from "akanjs/client";
import { buttonRecipe, Layout, Link } from "akanjs/ui";
import { AiOutlineCreditCard, AiOutlineRight, AiOutlineSafety } from "react-icons/ai";

export default function Page() {
  return (
    <Screen className="px-5 pb-24">
      <Layout.Navbar className={appNavClass} back>
        <div className="font-semibold">Payments</div>
      </Layout.Navbar>
      <section className="pt-5">
        <div className="rounded-[2rem] bg-gradient-to-br from-primary to-secondary p-5 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary-foreground/60 text-sm">Available balance</p>
              <h1 className="mt-1 font-bold text-3xl">₩240,000</h1>
            </div>
            <AiOutlineSafety className="text-4xl" />
          </div>
        </div>
        <Link
          className={appCard(undefined, "mt-5 flex items-center gap-3 rounded-3xl p-4")}
          href="/profile/payments/methods"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary text-xl">
            <AiOutlineCreditCard />
          </div>
          <div className="flex-1">
            <p className="font-semibold">Payment methods</p>
            <p className="text-foreground/50 text-sm">Visa ending in 4242</p>
          </div>
          <AiOutlineRight className="text-foreground/40" />
        </Link>
        <div className="mt-5 space-y-3">
          {[
            ["Skyline Loft", "₩128,000", "Paid"],
            ["Garden House", "₩92,000", "Refunded"],
            ["Service fee", "₩20,000", "Paid"],
          ].map(([title, amount, status]) => (
            <div className={appCard(undefined, "flex items-center justify-between rounded-3xl p-4")} key={title}>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-foreground/50 text-sm">{status}</p>
              </div>
              <p className="font-semibold">{amount}</p>
            </div>
          ))}
        </div>
      </section>
      <Layout.BottomInset className="flex h-[72px] w-full bg-background/80 px-5 backdrop-blur">
        <Link
          className={buttonRecipe({ variant: "primary" }, "w-full rounded-2xl border-0")}
          href="/profile/payments/methods"
        >
          Manage payment methods
        </Link>
      </Layout.BottomInset>
    </Screen>
  );
}
export const pageConfig = { topInset: 48, bottomInset: 72, transition: "stack" } satisfies PageConfig;
