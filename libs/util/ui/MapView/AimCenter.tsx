"use client";
import { type cnst, st } from "@libs/util/client";
import { type ReactNode, useEffect } from "react";

import Marker from "./Marker";

interface AimCenterProps {
  className?: string;
  children: ReactNode;
  onChangeCenter?: (center: cnst.Coordinate) => void;
}
export default function AimCenter({ className, children, onChangeCenter }: AimCenterProps) {
  const mapCenter = st.use.mapCenter();
  useEffect(() => {
    if (onChangeCenter) onChangeCenter(mapCenter);
  }, [mapCenter]);
  return <Marker coordinate={mapCenter}>{children}</Marker>;
}
