import type { PageConfig } from "akanjs/client";
import { Layout, Link } from "akanjs/ui";
import { AiOutlineCheckCircle, AiOutlineClose, AiOutlineCompass } from "react-icons/ai";

export default function Page() {
  return (
    <div className="apptest-screen pb-24">
      {/* <Layout.TopLeftAction>
        <Link.Back>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/30 backdrop-blur">
            <AiOutlineClose className="text-2xl" />
          </div>
        </Link.Back>
        </Layout.TopLeftAction> */}
      <Link.Back>
        <div className="fixed top-12 left-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-black/30 backdrop-blur">
          <AiOutlineClose className="text-2xl" />
        </div>
      </Link.Back>
      {/* <section className=""> */}
      <div className="h-96 bg-linear-to-br from-primary via-secondary to-accent" />
      <div className="h-48 rounded-[2rem] p-5 px-4 shadow-2xl">
        <p className="text-primary text-sm">May 28 - May 30</p>
        <h1 className="mt-1 font-bold text-3xl">Seoul City Stay</h1>
        <p className="apptest-muted mt-2 text-sm leading-6">
          Review check-in details, the stay address, and nearby recommendations in one place.
        </p>
      </div>
      {/* </section> */}
      <section className="mt-5 grid gap-3 px-4">
        {[
          ["Check-in ready", "Reminder scheduled 2 hours before arrival"],
          ["Host confirmed", "Average response time is 5 minutes"],
          ["Route prepared", "4-minute walk from subway Line 2"],
        ].map(([title, desc]) => (
          <div className="apptest-card flex items-center gap-3 rounded-3xl p-4" key={title}>
            <AiOutlineCheckCircle className="text-2xl text-success" />
            <div>
              <p className="font-semibold">{title}</p>
              <p className="apptest-muted text-sm">{desc}</p>
            </div>
          </div>
        ))}
      </section>
      <Layout.BottomInset className="flex h-48 w-full bg-base-100/80 px-5 py-2 backdrop-blur" keyboardSticky>
        <Link className="btn btn-primary h-full w-full rounded-2xl border-0" href="/explore/detail">
          <AiOutlineCompass /> View stay again
        </Link>
      </Layout.BottomInset>
    </div>
  );
}
export const pageConfig = {
  topInset: 0,
  safeArea: {
    top: false,
    bottom: true,
  },
  bottomInset: 192,
  transition: "fade",
} satisfies PageConfig;
