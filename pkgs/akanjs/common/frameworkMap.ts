import type { AkanGraphLocation } from "./akanGraph";

export interface FrameworkClass {
  name: string;
  members: number;
  at: AkanGraphLocation;
}

export interface FrameworkFacet {
  id: string;
  name: string;
  packageName: string;
  layer: number;
  files: number;
  classes: FrameworkClass[];
}

export interface FrameworkImport {
  from: string;
  to: string;
  value: number;
  type: number;
  dynamic: number;
  at: AkanGraphLocation;
}

export interface FrameworkSite {
  owner: string;
  count: number;
  at: AkanGraphLocation;
}

export interface FrameworkMessage {
  type: string;
  at: AkanGraphLocation;
  senders: FrameworkSite[];
  handlers: FrameworkSite[];
}

export interface FrameworkChannel {
  name: string;
  label: string;
  at: AkanGraphLocation;
  messages: FrameworkMessage[];
}

export interface FrameworkPackage {
  name: string;
  root: string;
}

export interface FrameworkMap {
  version: 1;
  packages: FrameworkPackage[];
  facets: FrameworkFacet[];
  imports: FrameworkImport[];
  channels: FrameworkChannel[];
  missing: string[];
  cycles: string[][];
}
