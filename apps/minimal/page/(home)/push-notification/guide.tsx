import { page } from "akanjs/client";
import { buttonRecipe, Link } from "akanjs/ui";
import type { ReactNode } from "react";

export default page().render(() => (
  <main className="min-h-screen bg-background px-5 py-8 text-foreground">
    <section className="mx-auto max-w-2xl rounded-3xl bg-muted p-6 shadow-xl">
      <p className="text-primary text-sm uppercase tracking-[0.24em]">Setup Guide</p>
      <h1 className="mt-3 font-bold text-3xl">Minimal Push Notification Demo</h1>

      <GuideSection title="Web">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Put Firebase web public config in `env/env.client.&lt;env&gt;.ts` under `firebase`.</li>
          <li>Run `bun run akan start minimal`.</li>
          <li>Open `/push-notification` and click Register.</li>
        </ol>
      </GuideSection>

      <GuideSection title="Native">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Keep `permissions: ["push"]` in the `native` section of `akan.config.ts`.</li>
          <li>
            Android: point `native.android.googleServices` at `google-services.json` (here `secrets/`). The app gets FCM
            tokens.
          </li>
          <li>iOS needs no Firebase file: the app gets an APNs device token and the server sends to APNs itself.</li>
          <li>
            Give the server `pushNoti.apns` (team id, key id, the .p8 key, bundle id) for iOS and `pushNoti.firebase`
            for Android and the web.
          </li>
          <li>Run the native app and open `/push-notification`.</li>
        </ol>
      </GuideSection>

      <GuideSection title="Send Test Push">
        <pre className="overflow-auto rounded-2xl bg-border p-4 text-xs">{`await pushNotificationServer.sendEach([{ token, provider }], {
  title: "Push demo",
  body: "Open the landing page",
  url: "/push-notification/landing",
});`}</pre>
        <p className="mt-3 text-foreground/70 text-sm">
          `PushNotificationServer` sends each token through its provider: APNs for the iOS app, FCM for Android and the
          web. Token storage, notification records, and invalid-token cleanup belong to the app.
        </p>
      </GuideSection>

      <Link className={buttonRecipe({ variant: "primary" }, "mt-6")} href="/push-notification">
        Back to push demo
      </Link>
    </section>
  </main>
));

const GuideSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-6 rounded-2xl bg-border p-4">
    <h2 className="font-semibold text-lg">{title}</h2>
    <div className="mt-3 text-foreground/80 text-sm">{children}</div>
  </section>
);
