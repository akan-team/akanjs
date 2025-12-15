export const randomPick = <T = any>(arr: T[] | readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
