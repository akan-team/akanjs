"use client";
import { st } from "@libs/shared/client";
import { useEffect } from "react";

export const RequestPermission = () => {
  useEffect(() => {
    const requestPermmsion = async () => {
      const permission = await Notification.requestPermission();
      st.do.setNotiPermission(permission);
    };
    void requestPermmsion();
    // if (permission === "granted") {
    //   console.log("Notification permission granted");
    // }
  }, []);
  return null;
};
