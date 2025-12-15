"use client";
import { type cnst, st } from "@util/client";
import { useEffect } from "react";

import Marker from "./Marker";

interface AimCenterProps {
  className?: string;
  children: any;
  onChangeCenter?: (center: cnst.Coordinate) => void;
}
export default function AimCenter({ className, children, onChangeCenter }: AimCenterProps) {
  const mapCenter = st.use.mapCenter();
  useEffect(() => {
    if (onChangeCenter) onChangeCenter(mapCenter);
  }, [mapCenter]);
  return <Marker coordinate={mapCenter}>{children}</Marker>;
}
