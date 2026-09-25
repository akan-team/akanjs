import { Link } from "akanjs/ui";
import { AiOutlineCamera, AiOutlineHeart } from "react-icons/ai";

export default function Page({ searchParams }: { searchParams: { deepLink?: string } }) {
  return (
    <div className="apptest-screen px-5 pt-6 pb-28">
      <div className="flex items-center justify-between">
        <div>
          <p className="apptest-subtle text-xs uppercase tracking-[0.24em]">Saved places</p>
          <h1 className="font-bold text-3xl">Wishlists</h1>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-2xl text-primary">
          <AiOutlineHeart />
        </div>
      </div>
      {searchParams.deepLink ? (
        <div className="mt-5 rounded-3xl border border-primary/20 bg-primary/10 p-4 text-primary text-sm">
          deep link: {searchParams.deepLink}
        </div>
      ) : null}
      <div className="mt-6 grid gap-3">
        {[
          ["Weekend escapes", "4 stays", "from-primary to-secondary"],
          ["City favorite", "7 stays", "from-secondary to-accent"],
          ["Quiet workcation", "3 stays", "from-accent to-primary"],
        ].map(([title, count, color]) => (
          <div className="apptest-card overflow-hidden rounded-[1.75rem]" key={title}>
            <div className={`h-24 bg-gradient-to-br ${color}`} />
            <div className="p-4">
              <p className="font-semibold">{title}</p>
              <p className="apptest-muted mt-1 text-sm">{count}</p>
            </div>
          </div>
        ))}
      </div>
      <Link className="btn btn-primary mt-5 w-full rounded-2xl border-0" href="/wishlists/camera?deepLink=true">
        <AiOutlineCamera /> Capture a new place
      </Link>
    </div>
  );
}
