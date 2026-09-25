import type { ModelProps } from "akanjs/client";
import type { SliceMeta } from "akanjs/fetch";
import type { ReactNode } from "react";
import { Data } from "../Data";
import type { ListContainerProps } from "../Data/ListContainer";

interface AdminPanelProps<T extends string, State, Input, Full extends { id: string }, Light extends { id: string }>
  extends ListContainerProps<T, State, Input, Full, Light> {
  slice: SliceMeta;
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
  RefName extends string,
  State,
  Input,
  Full extends { id: string },
  Light extends { id: string },
>({
  slice,
  components,
  summaryColumns = ["totalAdmin"],
  insightColumns = ["count"],
  renderInsight = ({ insight }) => (
    <Data.Insight insight={insight} slice={slice} columns={insightColumns as unknown as "count"[]} />
  ),
  renderDashboard = ({ summary }) => (
    <Data.Dashboard summary={summary} slice={slice} columns={summaryColumns} queryMap={{}} />
  ),
  ...props
}: AdminPanelProps<RefName, State, Input, Full, Light>) {
  const { sliceName } = slice;
  return (
    <Data.ListContainer
      slice={slice}
      renderItem={components.Unit.General as (props: ModelProps<any, any>) => ReactNode}
      renderInsight={renderInsight}
      renderDashboard={renderDashboard}
      renderTemplate={components.Template.General as (props: { [key in RefName]: Full }) => ReactNode}
      renderView={(model) => <components.View.General {...({ [sliceName]: model } as { [key in RefName]: Full })} />}
      {...props}
    />
  );
}
