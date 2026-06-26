import type { PageConfig } from "akanjs/client";
import { Layout, Link } from "akanjs/ui";
import { AiOutlineCalendar, AiOutlineHeart, AiOutlineStar } from "react-icons/ai";

export default function Page() {
  return (
    <div className="apptest-screen pb-8">
      <Layout.Navbar
        right={<div className="font-semibold">Stay detail</div>}
        className="apptest-nav"
        back
      ></Layout.Navbar>
      <div className="px-5 pt-5">
        <div className="relative h-72 overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary via-secondary to-accent">
          <button className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-black/20 text-xl backdrop-blur">
            <AiOutlineHeart />
          </button>
          <div className="absolute right-4 bottom-4 left-4 rounded-3xl bg-black/25 p-4 backdrop-blur">
            <div className="flex items-center gap-1 text-amber-200">
              <AiOutlineStar /> <span className="text-sm">4.92 · Super stay</span>
            </div>
            <h1 className="mt-2 font-bold text-3xl">Skyline Loft</h1>
            <p className="text-sm text-white/70">Seolleung · Seoul</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          {[
            ["2", "guests"],
            ["1", "bedroom"],
            ["27F", "view"],
          ].map(([value, label]) => (
            <div className="apptest-card rounded-3xl p-4" key={label}>
              <p className="font-bold text-xl">{value}</p>
              <p className="apptest-muted text-xs">{label}</p>
            </div>
          ))}
        </div>
        <section className="apptest-card mt-6 rounded-[1.75rem] p-5">
          <h2 className="font-semibold text-xl">About this place</h2>
          <p className="apptest-muted mt-2 text-sm leading-6">
            A calm lounge with city views, perfect for late check-ins and short work stays.
          </p>
        </section>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Link className="btn btn-outline rounded-2xl" href="/profile/payments">
            <AiOutlineCalendar /> Book now
          </Link>
          <Link className="btn btn-primary rounded-2xl border-0" href="/profile/self">
            View profile
          </Link>
        </div>
        {/* <div className="apptest-card mt-5 rounded-[1.75rem] p-4">
          <User.Util.SignInPassword redirect="/explore/detail" />
        </div> */}
      </div>
    </div>
  );
}

export const pageConfig = { topInset: 48, transition: "scaleOut" } satisfies PageConfig;
