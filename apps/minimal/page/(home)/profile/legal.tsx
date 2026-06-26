import type { PageConfig } from "akanjs/client";
import { Layout } from "akanjs/ui";
import { AiOutlineFileProtect } from "react-icons/ai";

export default function Page() {
  return (
    <div className="apptest-screen px-5 pb-8">
      <Layout.Navbar className="apptest-nav" back>
        <div className="font-semibold">Legal info</div>
      </Layout.Navbar>
      <section className="pt-5">
        <div className="apptest-card rounded-[2rem] p-5">
          <AiOutlineFileProtect className="text-4xl text-primary" />
          <h1 className="mt-4 font-bold text-2xl">Trust and safety</h1>
          <p className="apptest-muted mt-2 text-sm leading-6">
            Review the terms and privacy standards you need to use the service in one place.
          </p>
        </div>
        <div className="mt-5 space-y-3">
          {["Terms of service", "Privacy policy", "Location policy", "Open source licenses"].map((item) => (
            <div className="apptest-card rounded-3xl p-4" key={item}>
              <p className="font-semibold">{item}</p>
              <p className="apptest-muted mt-1 text-sm">Updated May 2026</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
export const pageConfig = { topInset: 48, transition: "stack" } satisfies PageConfig;
