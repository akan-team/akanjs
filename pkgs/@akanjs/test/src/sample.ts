import { Dayjs, dayjs } from "@akanjs/base";
import { randomPick, randomPicks } from "@akanjs/common";
import Chance from "chance";

const chance = new Chance();

export const sample = Object.assign(chance, {
  dayjs: (opt?: {
    string?: boolean | undefined;
    american?: boolean | undefined;
    year?: number | undefined;
    month?: number | undefined;
    day?: number | undefined;
    min?: Dayjs | undefined;
    max?: Dayjs | undefined;
  }) => dayjs(chance.date({ ...opt, min: opt?.min?.toDate(), max: opt?.max?.toDate() })),
  pick: randomPick,
  picks: randomPicks,
});
