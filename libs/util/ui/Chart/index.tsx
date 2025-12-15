import { Bar, ChartData, ChartType, Doughnut, Line, Pie } from "./index_";

export type ChartDataType<CType extends ChartType> = ChartData<CType, number[], string> & {
  labels: string[];
};
// labels: string[];
// datasets: ChartData<CType, number[], string>[];

export const Chart = {
  Bar,
  Line,
  Doughnut,
  Pie,
};
