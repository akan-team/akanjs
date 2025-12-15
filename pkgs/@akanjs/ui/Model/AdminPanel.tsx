import type { ReactNode } from "react";

import { Data } from "../Data";
import type { ListContainerProps } from "../Data/ListContainer";

interface AdminPanelProps<T extends string, State, Input, Full extends { id: string }, Light extends { id: string }>
  extends ListContainerProps<T, State, Input, Full, Light> {
  sliceName: T;
  components: {
    Template: { [key: string]: any };
    Unit: { [key: string]: any };
    View: { [key: string]: any };
  };
  queryMap?: { [key: string]: any };
  summaryColumns?: string[];
  insightColumns?: string[];
}

export default function AdminPanel<
  T extends string,
  State,
  Input,
  Full extends { id: string },
  Light extends { id: string },
>({
  sliceName,
  components,
  summaryColumns = ["totalAdmin"],
  insightColumns = ["count"],
  renderInsight = ({ insight }) => (
    <Data.Insight insight={insight} sliceName={sliceName} columns={insightColumns as unknown as "count"[]} />
  ),
  renderDashboard = ({ summary }) => (
    <Data.Dashboard summary={summary} sliceName={sliceName} columns={summaryColumns} queryMap={{}} />
  ),
  ...props
}: AdminPanelProps<T, State, Input, Full, Light>) {
  return (
    <Data.ListContainer
      sliceName={sliceName}
      renderItem={components.Unit.General as (props: { [key in T]: Light }) => ReactNode}
      renderInsight={renderInsight}
      renderDashboard={renderDashboard}
      renderTemplate={components.Template.General as (props: { [key in T]: Full }) => ReactNode}
      renderView={(model) => <components.View.General {...({ [sliceName]: model } as { [key in T]: Full })} />}
      {...props}
    />
  );
}
