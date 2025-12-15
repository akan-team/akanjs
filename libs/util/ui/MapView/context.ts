"use client";
import { PigeonProps } from "pigeon-maps";
import { createContext } from "react";

interface MapViewContextType {
  type: "google" | "pigeon";
}

export const MapViewContext = createContext<MapViewContextType>({
  type: "google",
});

export const PigeonMapPropsContext = createContext<PigeonProps>({} as unknown as PigeonProps);
