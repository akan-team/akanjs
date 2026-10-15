const byteUnits = ["B", "KB", "MB", "GB", "TB"] as const;

export const formatBytes = (bytes: number, fractionDigits = 2) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  let value = bytes;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < byteUnits.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  return `${unitIdx === 0 ? value : value.toFixed(fractionDigits)} ${byteUnits[unitIdx]}`;
};
