import type { PageConfig } from "akanjs/client";
import { Layout, Link } from "akanjs/ui";
import { AiOutlineEdit, AiOutlineMail, AiOutlinePhone, AiOutlineUser } from "react-icons/ai";

export default function Page() {
  return (
    <div className="apptest-screen px-5 pb-8">
      <Layout.Navbar className="apptest-nav" back>
        <div className="font-semibold">My Profile</div>
      </Layout.Navbar>
      <section className="pt-5">
        <div className="apptest-card rounded-[2rem] p-5 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-gradient-to-br from-primary to-secondary text-3xl text-primary-content">
            <AiOutlineUser />
          </div>
          <h1 className="mt-4 font-bold text-2xl">Seon Guest</h1>
          <p className="apptest-muted text-sm">Premium traveler</p>
        </div>
        <div className="mt-5 grid gap-3">
          {[
            [<AiOutlineMail key="email" />, "Email", "guest@seon.app"],
            [<AiOutlinePhone key="phone" />, "Phone", "+82 10-0000-0000"],
          ].map(([icon, label, value]) => (
            <div className="apptest-card flex items-center gap-3 rounded-3xl p-4" key={label as string}>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary text-xl">
                {icon}
              </div>
              <div>
                <p className="apptest-muted text-sm">{label}</p>
                <p className="font-semibold">{value}</p>
              </div>
            </div>
          ))}
        </div>
        <Link className="btn btn-primary mt-5 w-full rounded-2xl border-0" href="/profile/self/edit">
          <AiOutlineEdit /> Edit profile
        </Link>
      </section>
    </div>
  );
}
export const pageConfig = { topInset: 48, transition: "stack" } satisfies PageConfig;
