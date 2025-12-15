"use client";
import { device } from "@akanjs/client";
import { Contacts, PermissionStatus } from "@capacitor-community/contacts";
import { useEffect, useState } from "react";

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
      if (permissions.contacts === "prompt") {
        const { contacts } = await Contacts.requestPermissions();
        setPermissions((prev) => ({ ...prev, contacts }));
      } else if (permissions.contacts === "denied") {
        location.assign("app-settings:");
        return;
      }
    } catch (e) {
      //
    }
  };

  const getContacts = async () => {
    await checkPermission();
    const { contacts } = await Contacts.getContacts({ projection: { name: true, phones: true } });
    return contacts;
  };

  useEffect(() => {
    void (async () => {
      if (device.info.platform === "web") return;
      const permissions = await Contacts.checkPermissions();
      setPermissions(permissions);
    })();
  }, []);

  return { permissions, getContacts, checkPermission };
};
