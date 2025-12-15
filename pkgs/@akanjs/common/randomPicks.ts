export const randomPicks = <T>(arr: T[] | readonly T[], count = 1, allowDuplicate = false): T[] => {
  if (!allowDuplicate && arr.length <= count) return arr as T[];
  const idxs: number[] = [];
  let pickIdx: number;
  for (let i = 0; i < count; i++) {
    do {
      pickIdx = Math.floor(Math.random() * arr.length);
    } while (!allowDuplicate && idxs.includes(pickIdx));
    idxs.push(pickIdx);
  }
  return idxs.map((idx) => arr[idx]);
};
