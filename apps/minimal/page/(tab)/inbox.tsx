import type { PageConfig } from "akanjs/client";
import { Layout, Link } from "akanjs/ui";
import { AiOutlineMessage, AiOutlineRight } from "react-icons/ai";

export default function Page() {
  return (
    <div className="apptest-screen px-5 pb-28">
      <Layout.TopInset className="apptest-nav flex items-center px-5" estimatedHeight={pageConfig.topInset}>
        <div className="flex w-full items-center justify-between">
          <div>
            <p className="apptest-subtle text-xs uppercase tracking-[0.24em]">Messages</p>
            <h2 className="font-semibold text-xl">Inbox</h2>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <AiOutlineMessage />
          </div>
        </div>
      </Layout.TopInset>
      <div className="space-y-3 pt-5">
        {[
          ["Seolleung host", "I sent the check-in instructions.", "2m"],
          ["Travel support", "Your reservation change request was received.", "1h"],
          ["Stay concierge", "Check out nearby recommendations.", "Yesterday"],
        ].map(([name, message, time]) => (
          <Link className="apptest-card flex items-center gap-3 rounded-3xl p-4" href="/inbox/chat" key={name}>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary font-bold text-primary-content">
              {name[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate font-semibold">{name}</p>
                <p className="apptest-subtle text-xs">{time}</p>
              </div>
              <p className="apptest-muted mt-1 truncate text-sm">{message}</p>
            </div>
            <AiOutlineRight className="apptest-subtle" />
          </Link>
        ))}
      </div>
    </div>
  );
}
export const pageConfig = { topInset: 72 } satisfies PageConfig;
