"use client";
import { cnst, st, usePage } from "@libs/shared/client";
import { usePushNotification } from "@libs/util/webkit";
import { cn } from "akanjs/client";
import { Select, Switch } from "akanjs/ui";
import { useEffect, useState } from "react";

interface PushSettingProps {
  className?: string;
  notiSetting: cnst.NotiSetting["value"];
}

export const PushSetting = ({ className, notiSetting: initialNotiSetting }: PushSettingProps) => {
  const { l } = usePage();
  const self = st.use.self();
  const deviceToken = st.use.deviceToken();
  const pushPermission = st.use.pushPermission();
  const pushRegistered = st.use.pushRegistered();
  const notiSetting = st.use.notiSetting();
  const pushNotification = usePushNotification();
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // The one mount read this screen cannot avoid: a push token exists only in the browser, so no route can
  // fetch it. The saved setting comes down as a prop instead of a second round trip.
  useEffect(() => {
    const load = async () => {
      setIsSupported(await pushNotification.isSupported());
      const permission = await pushNotification.getPermission();
      const pushToken = permission === "granted" ? await pushNotification.getToken() : undefined;
      await st.do.loadPushState(pushToken?.token ?? null, permission, initialNotiSetting);
    };
    void load();
  }, []);

  const checked = pushRegistered === true;

  const toggle = async (on: boolean) => {
    setIsBusy(true);
    try {
      if (!on) {
        if (deviceToken) await st.do.unregisterPushToken(deviceToken);
        return;
      }
      const pushToken = await pushNotification.register();
      if (!pushToken) {
        await st.do.loadPushState(null, await pushNotification.getPermission());
        return;
      }
      await st.do.registerPushToken(pushToken);
    } finally {
      setIsBusy(false);
    }
  };

  st.tool("setPushOnThisDevice", {
    guard: ({ on }) =>
      isSupported === false
        ? "This browser cannot receive push notifications."
        : on === checked
          ? `Push is already ${on ? "on" : "off"} on this device.`
          : true,
  })
    .desc("Turn push notifications on or off for the browser the person is looking at.")
    .arg("on", Boolean)
    .exec(toggle);

  st.tool("setNotiSetting")
    .desc(
      "Set how much this account is notified: normal for everything, fewer for only what needs acting on, block for nothing.",
    )
    .arg("notiSetting", cnst.NotiSetting)
    .exec(async (setting) => {
      await st.do.setNotiSettingOfSelf(self.id, setting);
    });

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-gaegu text-lg">{l("notification.pushOnThisDevice")}</p>
          <p className="mt-1 text-muted-foreground text-sm">{l("notification.pushOnThisDeviceDesc")}</p>
        </div>
        <Switch checked={checked} disabled={isSupported === false || isBusy} onChange={toggle} />
      </div>
      {isSupported === false ? (
        <p className="text-muted-foreground text-sm">{l("notification.pushUnsupported")}</p>
      ) : pushPermission === "denied" ? (
        <p className="text-destructive text-sm">{l("notification.pushDenied")}</p>
      ) : (
        <p className="text-muted-foreground text-sm">{l("notification.pushInstallForIos")}</p>
      )}
      <Select
        label={l("notification.notiSetting")}
        value={notiSetting}
        options={cnst.NotiSetting}
        onChange={async (setting) => {
          await st.do.setNotiSettingOfSelf(self.id, setting);
        }}
      />
    </div>
  );
};
