"use client";
import "chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm";

import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Title, Tooltip } from "chart.js";
import { Bar as BarChart } from "react-chartjs-2";
import { withChartDefaults } from "./chartOptions";
import type { BarProps } from "./type";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function Bar({ options, ...props }: BarProps) {
  return <BarChart {...props} options={withChartDefaults(options)} />;
}
