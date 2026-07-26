import type { PageConfig } from "akanjs/client";
import { cn } from "akanjs/client";
import { buttonVariants, Layout } from "akanjs/ui";
import { AiOutlineSave } from "react-icons/ai";

export default function Page() {
  return (
    <div className="apptest-screen px-5 pb-8">
      <Layout.Navbar className="apptest-nav" back>
        <div className="font-semibold">Edit profile</div>
      </Layout.Navbar>
      <div className="space-y-4 pt-5">
        <label className="block">
          <span className="apptest-muted text-sm">Name</span>
          <input
            className="input mt-2 w-full rounded-2xl border-foreground/10 bg-base-200/70 text-foreground"
            defaultValue="Seon Guest"
          />
        </label>
        <label className="block">
          <span className="apptest-muted text-sm">Bio</span>
          <textarea
            className="textarea mt-2 min-h-32 w-full rounded-2xl border-foreground/10 bg-base-200/70 text-foreground"
            defaultValue="I like calm spaces in the city."
          />
        </label>
        <button className={cn(buttonVariants({ variant: "primary" }), "w-full rounded-2xl border-0")}>
          <AiOutlineSave /> Save changes
        </button>
      </div>
    </div>
  );
}
export const pageConfig = { topInset: 48, transition: "stack" } satisfies PageConfig;
