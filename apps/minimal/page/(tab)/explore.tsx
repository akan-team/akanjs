import { Link } from "akanjs/ui";
import { AiOutlineArrowRight, AiOutlineEnvironment, AiOutlineStar } from "react-icons/ai";

export default function Page() {
  return (
    <div className="h-screen bg-base-100 px-5 pt-6 pb-28 text-base-content">
      <section className="rounded-[2rem] bg-gradient-to-br from-primary via-secondary to-accent p-[1px] shadow-2xl shadow-primary/20">
        <div className="rounded-[2rem] bg-base-200/95 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary text-sm">Good afternoon</p>
              <h1 className="mt-1 font-bold text-3xl tracking-tight">Where are you headed today?</h1>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-2xl text-primary">
              <AiOutlineEnvironment />
            </div>
          </div>
          <div className="mt-6 rounded-2xl bg-base-content/5 p-4">
            <p className="apptest-muted text-xs uppercase tracking-[0.3em]">Featured stay</p>
            <p className="mt-2 font-semibold text-xl">Skyline loft in Seolleung</p>
            <p className="apptest-muted mt-1 text-sm">A premium space with city night views and a quiet lounge</p>
            <div className="mt-4 grid gap-2">
              <Link className="btn btn-primary w-full rounded-2xl border-0" href="/push-notification">
                Push notification demo <AiOutlineArrowRight />
              </Link>
              <Link className="btn btn-ghost w-full rounded-2xl" href="/explore/detail">
                View details
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="apptest-muted text-xs uppercase tracking-[0.24em]">Recommended</p>
            <h2 className="font-semibold text-xl">Popular stays right now</h2>
          </div>
          <AiOutlineStar className="text-primary text-xl" />
        </div>
        <div className="grid gap-3">
          {[
            ["River view suite", "Han River view, 2 guests", "₩128,000"],
            ["Quiet work lounge", "A work stay built for focus", "₩74,000"],
            ["Garden house", "Green terrace and brunch", "₩92,000"],
          ].map(([title, desc, price]) => (
            <Link
              className="apptest-card flex items-center justify-between rounded-3xl p-4 backdrop-blur"
              href={title === "Quiet work lounge" ? "/push-notification" : "/explore/detail"}
              key={title}
            >
              <div>
                <p className="font-semibold">{title}</p>
                <p className="apptest-muted mt-1 text-sm">{desc}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-primary">{price}</p>
                <p className="apptest-subtle text-xs">/ night</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
