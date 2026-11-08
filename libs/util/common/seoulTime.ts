import { type Dayjs, dayjs } from "akanjs/base";

const seoulOffsetMinutes = 9 * 60;

/**
 * The same instant as a Dayjs whose local fields read Seoul's wall clock in any runtime zone. The server renders in
 * Asia/Seoul while a browser formats in its own zone, so a time or a calendar day formatted any other way hydrates
 * differently outside Korea. The drift step covers a runtime whose own offset changes across the shift (DST).
 */
export const seoulTime = (at: Dayjs = dayjs()) => {
  const shifted = at.add(at.toDate().getTimezoneOffset() + seoulOffsetMinutes, "minute");
  const drift = shifted.toDate().getTimezoneOffset() - at.toDate().getTimezoneOffset();
  return drift ? shifted.add(drift, "minute") : shifted;
};
