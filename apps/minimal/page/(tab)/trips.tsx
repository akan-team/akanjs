import type { PageConfig } from "akanjs/client";
import { Layout, Link } from "akanjs/ui";
import { AiOutlineCalendar, AiOutlineRight } from "react-icons/ai";

export default function Page() {
  return (
    <div className="apptest-screen px-5 pb-28">
      <Layout.TopInset className="apptest-nav flex items-center px-5" estimatedHeight={pageConfig.topInset}>
        <div className="flex w-full items-center justify-between">
          <div>
            <p className="apptest-subtle text-xs uppercase tracking-[0.24em]">Upcoming</p>
            <h2 className="font-semibold text-xl">Trips</h2>
          </div>
          <AiOutlineCalendar className="text-2xl text-primary" />
        </div>
      </Layout.TopInset>
      <section className="pt-5">
        <Link className="block overflow-hidden rounded-[2rem] bg-base-200 text-base-content" href="/trips/detail">
          <div className="h-36 bg-gradient-to-br from-primary via-secondary to-accent" />
          <div className="p-5">
            <p className="apptest-muted text-xs uppercase tracking-[0.24em]">Next trip</p>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-2xl">Seoul City Stay</h3>
                <p className="apptest-muted mt-1 text-sm">May 28 - May 30 · 2 guests</p>
              </div>
              <AiOutlineRight />
            </div>
          </div>
        </Link>
        <div className="mt-4 grid gap-3">
          {["Check-in guide", "Host message", "Local places"].map((item) => (
            <div className="apptest-card rounded-3xl p-4" key={item}>
              <p className="font-semibold">{item}</p>
              <p className="apptest-muted mt-1 text-sm">Helpful details are ready for you before your trip.</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
export const pageConfig = { topInset: 72 } satisfies PageConfig;
