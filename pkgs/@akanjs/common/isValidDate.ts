import dayjs, { Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

import { isDayjs } from "./isDayjs";

dayjs.extend(customParseFormat);

export const isValidDate = (d: string | Date | Dayjs) => {
  const format = "YYYY-MM-DD";
  if (typeof d === "string") {
    return dayjs(d, format).isValid();
    // ! Aggregation에서는 위 코드처럼 해야함. 다른곳에서 필요하면 아래 코드 사용해야 할 이유를 찾아보기
    // return dayjs(d, format, true).isValid();
    // } else if (isDayjs(d)) return dayjs(d.format(format), format, true).isSame(d);
  } else if (isDayjs(d)) return d.isValid();
  else return d instanceof Date && !isNaN(d.getTime());
};
