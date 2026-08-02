"use client";
import { Device } from "akanjs/client";
import { type CapacitorPermissionState, loadCapacitorContacts } from "akanjs/client/capacitor";
import { useEffect, useState } from "react";

type PermissionStatus = {
  contacts: CapacitorPermissionState;
};

/** Capacitor contacts hook with permission checks and contact loading helpers. */
export const useContact = () => {
  const [permissions, setPermissions] = useState<PermissionStatus>({ contacts: "prompt" });

  /**
   * 최초로 킬 경우 권한은 prompt 상태이다.
   * prompt 상태일 경우 권한을 요청한다.
   * 권한이 denied 상태일 경우 설정으로 이동한다.
   * 이후 state의 permission을 업데이트해야한다.
   *
   */
  const checkPermission = async () => {
    try {
      const { Contacts } = await loadCapacitorContacts();
      if (permissions.contacts === "prompt") {
        const { contacts } = await Contacts.requestPermissions();
        setPermissions((prev) => ({ ...prev, contacts }));
      } else if (permissions.contacts === "denied") {
        location.assign("app-settings:");
        return;
      }
    } catch {
      //
    }
  };

  const getContacts = async () => {
    await checkPermission();
    const { Contacts } = await loadCapacitorContacts();
    const { contacts } = await Contacts.getContacts({ projection: { name: true, phones: true } });
    return contacts;
  };

  useEffect(() => {
    void (async () => {
      if (Device.getDevice().info.platform === "web") return;
      const { Contacts } = await loadCapacitorContacts();
      const permissions = await Contacts.checkPermissions();
      setPermissions(permissions);
    })();
  }, []);

  return { permissions, getContacts, checkPermission };
};
