import type { ChartOptions, ChartType } from "chart.js";

//? The title shows only with text: Chart.js reserves a line of height for a displayed title even when it is empty.
export const withChartDefaults = <T extends ChartType>(options?: ChartOptions<T>): ChartOptions<T> =>
  ({
    responsive: true,
    ...options,
    plugins: {
      ...options?.plugins,
      legend: { display: true, ...options?.plugins?.legend },
      title: { display: !!options?.plugins?.title?.text, font: { size: 20 }, ...options?.plugins?.title },
    },
  }) as ChartOptions<T>;
