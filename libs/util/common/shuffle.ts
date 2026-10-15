export const shuffle = <T>(arr: readonly T[]): T[] => {
  const shuffled = [...arr];
  for (let idx = shuffled.length - 1; idx > 0; idx -= 1) {
    const swapIdx = Math.floor(Math.random() * (idx + 1));
    [shuffled[idx], shuffled[swapIdx]] = [shuffled[swapIdx] as T, shuffled[idx] as T];
  }
  return shuffled;
};
