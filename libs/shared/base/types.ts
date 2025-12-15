import { Dayjs } from "@akanjs/base";
import type { TElement } from "@udecode/plate-common";

export type SlateContent = TElement[];

export interface Self {
  id: string;
  nickname: string;
  roles: string[];
  image: {
    url: string;
    imageSize: [number, number];
  } | null;
  profileStatus: "active" | "prepare" | "applied" | "approved" | "reapplied" | "featured" | "reserved" | "rejected";
  status: "prepare" | "active" | "restricted" | "dormant";
  removedAt: Dayjs | null;
}

export interface Me {
  id: string;
  accountId: string;
  roles: string[];
  removedAt: Dayjs | null;
}
