"use client";
import "chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm";

import { ArcElement, Chart as ChartJS, Legend, Title, Tooltip } from "chart.js";
import { Pie as PieChart } from "react-chartjs-2";
import { withChartDefaults } from "./chartOptions";
import type { PieProps } from "./type";

ChartJS.register(ArcElement, Title, Tooltip, Legend);

export default function Pie({ options, ...props }: PieProps) {
  return <PieChart {...props} options={withChartDefaults(options)} />;
}
