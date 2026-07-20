import type { Dayjs } from "akanjs/base";

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
