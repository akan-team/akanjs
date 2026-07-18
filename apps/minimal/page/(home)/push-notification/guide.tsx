import { Link } from "akanjs/ui";
import type { ReactNode } from "react";

export default function Page() {
  return (
    <main className="min-h-screen bg-base-100 px-5 py-8 text-base-content">
      <section className="mx-auto max-w-2xl rounded-3xl bg-base-200 p-6 shadow-xl">
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
            <li>Add `@capacitor/push-notifications` and `@capacitor-community/fcm` to the app package dependencies.</li>
            <li>Keep `permissions: ["push"]` in `akan.config.ts`.</li>
            <li>
              Put Android `google-services.json` at `public/google-services.json`. Akan copies it to
              `android/app/google-services.json`.
            </li>
            <li>
              Put iOS `GoogleService-Info.plist` at `public/GoogleService-Info.plist`. Akan copies it to
              `ios/App/App/GoogleService-Info.plist`.
            </li>
            <li>Configure Firebase Console and upload APNs development/production credentials for iOS delivery.</li>
            <li>Run the mobile target and open `/push-notification`.</li>
          </ol>
        </GuideSection>

        <GuideSection title="Send Test Push">
          <pre className="overflow-auto rounded-2xl bg-base-300 p-4 text-xs">{`await pushNotificationServer.send({
  token,
  title: "Push demo",
  body: "Open the landing page",
  url: "/push-notification/landing",
});`}</pre>
          <p className="mt-3 text-base-content/70 text-sm">
            `PushNotificationServer` only sends through FCM. Token storage, notification records, and invalid-token
            cleanup belong to the app.
          </p>
        </GuideSection>

        <Link className="btn btn-primary mt-6" href="/push-notification">
          Back to push demo
        </Link>
      </section>
    </main>
  );
}

const GuideSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-6 rounded-2xl bg-base-300 p-4">
    <h2 className="font-semibold text-lg">{title}</h2>
    <div className="mt-3 text-base-content/80 text-sm">{children}</div>
  </section>
);
