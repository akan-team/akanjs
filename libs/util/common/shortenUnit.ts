export const shortenUnit = (num: number): string => {
  if (num < 1000) return num.toString();
  else if (num < 10000) return (num / 1000).toFixed(2) + "k";
  else if (num < 100000) return (num / 1000).toFixed(1) + "k";
  else if (num < 1000000) return (num / 1000).toString() + "k";
  else if (num < 10000000) return (num / 1000000).toFixed(2) + "m";
  else if (num < 100000000) return (num / 1000000).toFixed(1) + "m";
  else if (num < 1000000000) return (num / 1000000).toString() + "m";
  else if (num < 10000000000) return (num / 1000000000).toFixed(2) + "b";
  else if (num < 100000000000) return (num / 1000000000).toFixed(1) + "b";
  else if (num < 1000000000000) return (num / 1000000000).toString() + "b";
  else if (num < 10000000000000) return (num / 1000000000000).toFixed(2) + "t";
  else if (num < 100000000000000) return (num / 1000000000000).toFixed(1) + "t";
  else return (num / 1000000000000).toString() + "t";
};
