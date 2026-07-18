"use client";

import { Link } from "akanjs/ui";
import { type PushToken, usePushNotification } from "akanjs/webkit";
import { useState } from "react";

export const PushNotificationDemo = () => {
  const push = usePushNotification();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<string>("unknown");
  const [pushToken, setPushToken] = useState<PushToken | null>(null);
  const [bridgeReady, setBridgeReady] = useState<boolean | null>(null);

  const refreshStatus = async () => {
    setSupported(await push.isSupported());
    setPermission(await push.getPermission());
  };

  const register = async () => {
    const token = await push.register();
    setPushToken(token ?? null);
    setPermission(await push.getPermission());
  };

  const initClickBridge = async () => {
    setBridgeReady(await push.initClickBridge());
  };

  return (
    <main className="min-h-screen bg-base-100 px-5 py-8 text-base-content">
      <section className="mx-auto max-w-2xl rounded-3xl bg-base-200 p-6 shadow-xl">
        <p className="text-primary text-sm uppercase tracking-[0.24em]">Push Notification Demo</p>
        <h1 className="mt-3 font-bold text-3xl">usePushNotification</h1>
        <p className="mt-3 text-base-content/70">
          This page checks the unified web/native push client API. The token is shown only on screen. Persist it with
          your own app-level API.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <button className="btn btn-outline" onClick={refreshStatus} type="button">
            Check status
          </button>
          <button className="btn btn-primary" onClick={register} type="button">
            Register
          </button>
          <button className="btn btn-secondary" onClick={initClickBridge} type="button">
            Init click bridge
          </button>
        </div>

        <div className="mt-6 grid gap-3">
          <StatusRow label="Supported" value={supported === null ? "unknown" : String(supported)} />
          <StatusRow label="Permission" value={permission} />
          <StatusRow label="Click bridge" value={bridgeReady === null ? "unknown" : String(bridgeReady)} />
        </div>

        <div className="mt-6 rounded-2xl bg-base-300 p-4">
          <p className="font-semibold">PushToken</p>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">
            {pushToken ? JSON.stringify(pushToken, null, 2) : "No token yet"}
          </pre>
        </div>

        <div className="mt-6 rounded-2xl bg-base-300 p-4 text-base-content/70 text-sm">
          <p className="font-semibold text-base-content">App-level storage example</p>
          <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs">{`const pushToken = await push.register();
if (pushToken) await appApi.registerPushToken(pushToken);`}</pre>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="btn btn-ghost" href="/explore">
            Back to Explore
          </Link>
          <Link className="btn btn-ghost" href="/push-notification/landing">
            Open demo landing
          </Link>
          <Link className="btn btn-ghost" href="/push-notification/guide">
            Setup guide
          </Link>
        </div>
      </section>
    </main>
  );
};

const StatusRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between rounded-2xl bg-base-300 px-4 py-3">
    <span className="font-medium">{label}</span>
    <span className="text-base-content/70">{value}</span>
  </div>
);
