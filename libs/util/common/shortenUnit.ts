const shortUnits = ["", "k", "m", "b", "t"] as const;

const fractionDigitsOf = (value: number) => (Math.abs(value) < 10 ? 2 : Math.abs(value) < 100 ? 1 : 0);

export const shortenUnit = (num: number): string => {
  if (Math.abs(num) < 1000) return num.toString();
  let unitIdx = 0;
  while (unitIdx < shortUnits.length - 1 && Math.abs(num) >= 1000 ** (unitIdx + 1)) unitIdx += 1;
  for (; ; unitIdx += 1) {
    const scaled = num / 1000 ** unitIdx;
    const rounded = Number(scaled.toFixed(fractionDigitsOf(scaled)));
    if (Math.abs(rounded) >= 1000 && unitIdx < shortUnits.length - 1) continue;
    return `${scaled.toFixed(fractionDigitsOf(rounded))}${shortUnits[unitIdx]}`;
  }
};
