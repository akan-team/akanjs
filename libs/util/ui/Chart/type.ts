import type { ChartData, ChartType } from "chart.js";
import type { ChartProps } from "react-chartjs-2";

export type BarProps = Omit<ChartProps<"bar">, "type">;
export type LineProps = Omit<ChartProps<"line">, "type">;
export type PieProps = Omit<ChartProps<"pie">, "type">;
export type DoughnutProps = Omit<ChartProps<"doughnut">, "type">;

export type ChartDataType<CType extends ChartType> = ChartData<CType, number[], string> & {
  labels: string[];
};
