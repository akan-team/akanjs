import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  Model: string;
  model: string;
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: "index.tsx",
    content: `
import { Signal } from "@akanjs/ui";
import { AiOutlineDatabase } from "react-icons/ai";

import * as Template from "./${dict.Model}.Template";
import * as Unit from "./${dict.Model}.Unit";
import * as Util from "./${dict.Model}.Util";
import * as View from "./${dict.Model}.View";
import * as Zone from "./${dict.Model}.Zone";

export const ${dict.Model} = {
  Menu: {
    Admin: {
      key: "${dict.model}",
      label: "${dict.Model}",
      icon: <AiOutlineDatabase />,
      render: () => <Zone.Admin />,
    },
    Doc: {
      key: "${dict.model}",
      label: "${dict.Model}",
      icon: <AiOutlineDatabase />,
      render: () => <Signal.Doc.Zone refName="${dict.model}" />,
    },
  },
  Template,
  Unit,
  Util,
  View,
  Zone,
};
`,
  };
}
