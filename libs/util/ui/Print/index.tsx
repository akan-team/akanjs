import { Area } from "./Area";
import { Provider, type ProviderProps } from "./Provider";
import { Trigger } from "./Trigger";

export const Print = (props: ProviderProps) => {
  return <Provider {...props} />;
};

Print.Area = Area;
Print.Trigger = Trigger;
// Build a `pageStyle` for Print.Trigger with real page margins. react-to-print's default
// zeroes `@page` margins, so pass this to give the printed PDF breathing room on every page
// while keeping background colors (print-color-adjust) intact.
Print.pageMargin = (margin: string) => `
  @page { margin: ${margin}; }
  @media print {
    body {
      color-adjust: exact;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }
`;
