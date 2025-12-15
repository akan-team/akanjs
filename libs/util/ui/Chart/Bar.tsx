"use client";
import "chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm";

import type { ChartData, ChartOptions } from "chart.js";
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Title, Tooltip } from "chart.js";
import { Bar as BarChart, ChartProps } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface BarProps {
  data?: ChartData<"bar", number[], string>;
  options?: ChartOptions<"bar">;
}

type PropsType = Omit<ChartProps<"bar">, "type">;

export default function Bar(props: PropsType) {
  return (
    <BarChart
      options={{
        responsive: true,
        plugins: {
          legend: {
            display: true,
          },
          title: {
            display: true,
            font: {
              size: 20,
            },
          },
        },
        ...props.options,
      }}
      {...props}
    />
  );
}

// const options = {
//   spanGaps: true, // 데이터가 중간중간 없을 때 이어 그릴지의 여부.
//   grouped: true, // x축 값이 같은 것끼리 묶일지의 여부. (주로 Line Chart 에서)
//   responsive: true, // canvas 의 반응형 여부
//   interaction: {
//     mode: 'index' as const, // - 같은 선상(index) 에 있는 값들 툴팁 다 보여줌
//     // mode: 'point' as const, - 특정 지점에 마우스를 호버하였을 때, 해당 툴팁 보여줌
//     axis: 'x' as const, // mode 가 index 일 때, 같은 선상이 x축인지 y축인지
//   },
//   plugins: {
//     legend: {
//       // https://www.chartjs.org/docs/latest/configuration/legend.html
//       display: true, // legend 표시 여부
//       position: 'top'|'left'|'bottom'|'right', // 범례의 위치
//       align: 'start' | 'center' | 'end' // 범례의 정렬
//       labels: { // labels 에 대한 스타일링
//         padding:10,
//         boxWidth: 13,
//         color: '#000',
//         font: {
//           family: 'Noto Sans KR',
//           lineHeight: 2,
//         },
//       },
//     },
//     tooltip: {
//       // https://www.chartjs.org/docs/latest/configuration/tooltip.html
//       reverse: true, // 반대로 보일건지 여부
//       padding: 20,
//       caretPadding: 10,
//       font: {
//         family: "'Noto Sans KR', sans-serif" as const,
//         color: '#000' as const,
//       },
//       titleMarginBottom: 10,
//       titleSpacing: 10,
//       bodySpacing: 10,
//       filter: (item: { parsed: any }) => item.parsed.y !== null,
//         // 툴팁에 보여질 데이터를 필터링해줌. 위 코드는 null 인 값은 보이지 않게 함
//       usePointStyle: false, //true 로 하면 다른 모양으로 스타일을 설정할 수 있는데, 플러그인 등록
//       callbacks: {
//         // 툴팁에 표시되는 내용 콜백함수
//         // context.parsed.y 은 y 축 값, context.dataset.label는 표시되는 label
//         label: (context: any) => {
//           if (context.parsed.y === 0) {
//             return ' ' + context.dataset.label + ' -건';
//           }
//           return ' ' + context.dataset.label + ' ' + context.parsed.y + '건';
//         },
//       },
//       events:['click'], // 이벤트 발생 여부에 대해서. 컨트롤 가능
//     },
//   },
//   scales: {
//     //https://www.chartjs.org/docs/latest/axes/styling.html - [scaleId] 가 x 또는 y
//     x: {
//       axis: 'x',
//       display: true,
//       grid: {
//         color: '#ddd', // 그리드 색상
//         lineWidth: 1,  // 그리드 굵기
//       },
//       afterDataLimits: (scale: { max: number }) => {
//         scale.max = scale.max * 1;
//         // 정해진 범위만큼 보일건지, 그 이상으로 넓혀지게 보일건지
//       },
//       title: {
//     // 그리드 축에 대한 styles
//         display: false,
//         align: 'end',
//         color: '#808080',
//         font: {
//           size: 12,
//           family: "'Noto Sans KR', sans-serif",
//           weight: 300,
//         },
//         text: '건수',
//         padding: {
//           top: 10,
//           bottom: 10,
//         },
//       },
//       ticks: {
//         color: '#808080',
//         stepSize: getStepSize(min, max), // 축에 표시될 값들에 대한 간격 설정
//       },
//     },
//     y: {
//       // ... x축과 옵션이 동일함. Y축에 대한 옵션
//     },
//   },
// };
