import { appCard, appNavClass, Screen } from "@apps/minimal/ui";
import type { PageConfig } from "akanjs/client";
import { buttonRecipe, Layout } from "akanjs/ui";
import { AiOutlinePlus, AiOutlineSafetyCertificate } from "react-icons/ai";

export default function Page() {
  return (
    <Screen className="px-5 pb-8">
      <Layout.Navbar className={appNavClass} back>
        <div className="font-semibold">Payment method</div>
      </Layout.Navbar>
      <div className="space-y-4 pt-5">
        <div className="rounded-[2rem] bg-gradient-to-br from-primary to-secondary p-5 text-primary-foreground">
          <p className="text-primary-foreground/60 text-sm">Primary card</p>
          <p className="mt-8 font-bold text-2xl tracking-widest">4242 •••• •••• 1024</p>
          <div className="mt-5 flex items-center justify-between text-sm">
            <span>Seon Guest</span>
            <span>12/29</span>
          </div>
        </div>
        <div className={appCard(undefined, "rounded-3xl p-4")}>
          <div className="flex items-center gap-3">
            <AiOutlineSafetyCertificate className="text-2xl text-success" />
            <div>
              <p className="font-semibold">Secure payment</p>
              <p className="text-foreground/50 text-sm">Your payment information is securely encrypted and stored.</p>
            </div>
          </div>
        </div>
        <button className={buttonRecipe({ variant: "outline" }, "w-full rounded-2xl")}>
          <AiOutlinePlus /> Add new card
        </button>
      </div>
    </Screen>
  );
}
export const pageConfig = { topInset: 48, transition: "stack" } satisfies PageConfig;
