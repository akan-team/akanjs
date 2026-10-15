"use client";
import "chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm";

import { ArcElement, Chart as ChartJS, Legend, Title, Tooltip } from "chart.js";
import { Doughnut as DoughnutChart } from "react-chartjs-2";
import { withChartDefaults } from "./chartOptions";
import type { DoughnutProps } from "./type";

ChartJS.register(ArcElement, Title, Tooltip, Legend);

export default function Doughnut({ options, ...props }: DoughnutProps) {
  return <DoughnutChart {...props} options={withChartDefaults(options)} />;
}
