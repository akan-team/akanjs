import type { Dayjs } from "akanjs/base";

export interface AccessInfo {
  period: number;
  countryCode?: string;
  countryName?: string;
  city?: string;
  postal?: number;
  location?: {
    type: "Point";
    coordinates: [number, number];
  };
  ipv4?: string;
  state?: string;
  userAgent?: string;
  at: Dayjs;
}
