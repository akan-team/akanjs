import { PlatformAdminList } from "./platformAdminList";

export const setPlatformAdminIds = (value: string | undefined) => {
  if (value === undefined) delete process.env[PlatformAdminList.env];
  else process.env[PlatformAdminList.env] = value;
};

const listedIds = () =>
  (process.env[PlatformAdminList.env] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

export const listPlatformAdmin = (...adminIds: string[]) => {
  const previous = process.env[PlatformAdminList.env];
  const added = [...new Set(adminIds)].filter((adminId) => !listedIds().includes(adminId));
  setPlatformAdminIds([...listedIds(), ...added].join(","));
  return () => {
    const remaining = listedIds().filter((adminId) => !added.includes(adminId));
    setPlatformAdminIds(remaining.length ? remaining.join(",") : previous);
  };
};

export const withPlatformAdminIds = async <T>(value: string | undefined, run: () => Promise<T>) => {
  const previous = process.env[PlatformAdminList.env];
  setPlatformAdminIds(value);
  try {
    return await run();
  } finally {
    setPlatformAdminIds(previous);
  }
};

export const asPlatformAdmin = async <T>(adminId: string, run: () => Promise<T>) => {
  const unlist = listPlatformAdmin(adminId);
  try {
    return await run();
  } finally {
    unlist();
  }
};
