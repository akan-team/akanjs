"use client";
import "chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm";

import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import { Line as LineChart } from "react-chartjs-2";
import { withChartDefaults } from "./chartOptions";
import type { LineProps } from "./type";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function Line({ options, ...props }: LineProps) {
  return <LineChart {...props} options={withChartDefaults(options)} />;
}
