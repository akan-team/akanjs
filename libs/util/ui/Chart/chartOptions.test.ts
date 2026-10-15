import { describe, expect, test } from "bun:test";
import { withChartDefaults } from "./chartOptions";

describe("withChartDefaults", () => {
  test("keeps the defaults when the caller passes options of its own", () => {
    expect(withChartDefaults<"line">({ scales: { y: { beginAtZero: true } } })).toEqual({
      responsive: true,
      scales: { y: { beginAtZero: true } },
      plugins: { legend: { display: true }, title: { display: false, font: { size: 20 } } },
    });
  });

  test("lets every caller option win over a default", () => {
    const options = withChartDefaults<"bar">({
      responsive: false,
      plugins: {
        legend: { display: false },
        title: { text: "Sales", font: { size: 12 } },
        tooltip: { enabled: false },
      },
    });
    expect(options.responsive).toBe(false);
    expect(options.plugins?.legend?.display).toBe(false);
    expect(options.plugins?.title).toEqual({ display: true, text: "Sales", font: { size: 12 } });
    expect(options.plugins?.tooltip?.enabled).toBe(false);
  });

  test("shows a title only when there is text for it", () => {
    expect(withChartDefaults<"pie">().plugins?.title?.display).toBe(false);
    expect(withChartDefaults<"pie">({ plugins: { title: { text: "Share" } } }).plugins?.title?.display).toBe(true);
  });
});
