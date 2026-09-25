import { Snippet as CodeSnippet } from "../Code/Snippet";
import { Alert } from "./Alert";
import { ConstantDocsDemo, ConstantDocsPrintDemo } from "./ConstantDocsDemo";
import { Description } from "./Description";
import { type IntroItem, IntroTable } from "./IntroTable";
import { Layout } from "./Layout";
import { Mermaid } from "./Mermaid";
import { type OptionItem, OptionTable } from "./OptionTable";
import { Search } from "./Search";
import { SubSubTitle } from "./SubSubTitle";
import { SubTitle } from "./SubTitle";
import { Title } from "./Title";

export const Docs = {
  Layout,
  Title,
  Description,
  Mermaid,
  SubTitle,
  SubSubTitle,
  OptionTable,
  IntroTable,
  Alert,
  CodeSnippet,
  Search,
};
export type { OptionItem, IntroItem };
export { ConstantDocsDemo, ConstantDocsPrintDemo };
