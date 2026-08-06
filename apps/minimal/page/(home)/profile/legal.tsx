import { appCard, appNavClass, Screen } from "@apps/minimal/ui";
import type { PageConfig } from "akanjs/client";
import { Layout } from "akanjs/ui";
import { AiOutlineFileProtect } from "react-icons/ai";

export default function Page() {
  return (
    <Screen className="px-5 pb-8">
      <Layout.Navbar className={appNavClass} back>
        <div className="font-semibold">Legal info</div>
      </Layout.Navbar>
      <section className="pt-5">
        <div className={appCard(undefined, "rounded-[2rem] p-5")}>
          <AiOutlineFileProtect className="text-4xl text-primary" />
          <h1 className="mt-4 font-bold text-2xl">Trust and safety</h1>
          <p className="mt-2 text-foreground/50 text-sm leading-6">
            Review the terms and privacy standards you need to use the service in one place.
          </p>
        </div>
        <div className="mt-5 space-y-3">
          {["Terms of service", "Privacy policy", "Location policy", "Open source licenses"].map((item) => (
            <div className={appCard(undefined, "rounded-3xl p-4")} key={item}>
              <p className="font-semibold">{item}</p>
              <p className="mt-1 text-foreground/50 text-sm">Updated May 2026</p>
            </div>
          ))}
        </div>
      </section>
    </Screen>
  );
}
export const pageConfig = { topInset: 48, transition: "stack" } satisfies PageConfig;
