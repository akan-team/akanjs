import { Link } from "akanjs/ui";

export default function Page() {
  return (
    <main className="min-h-screen bg-base-100 px-5 py-8 text-base-content">
      <section className="mx-auto max-w-2xl rounded-3xl bg-base-200 p-6 shadow-xl">
        <p className="text-primary text-sm uppercase tracking-[0.24em]">Deep Link Target</p>
        <h1 className="mt-3 font-bold text-3xl">Push notification route opened</h1>
        <p className="mt-3 text-base-content/70">
          Use this route as the demo payload URL: <code>/push-notification/landing</code>
        </p>
        <Link className="btn btn-primary mt-6" href="/push-notification">
          Back to push demo
        </Link>
      </section>
    </main>
  );
}
