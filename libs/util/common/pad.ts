export const pad = (data: string | number, totalLength: number, padChar = "0") => {
  return String(data).padStart(totalLength, padChar);
};
