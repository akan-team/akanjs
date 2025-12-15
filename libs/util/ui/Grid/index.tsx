import { Abstract } from "./Abstract";
import { Detail } from "./Detail";
import { Provider, ProviderProps } from "./Provider";
import { Unit } from "./Unit";

export const Grid = (props: ProviderProps) => {
  return <Provider {...props} />;
};
Grid.Unit = Unit;
Grid.Abstract = Abstract;
Grid.Detail = Detail;
