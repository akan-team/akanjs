import { Snippet as CodeSnippet } from "../Code/Snippet";
import { AgentVisualDemo } from "./AgentVisualDemo";
import { Alert } from "./Alert";
import type { Audience } from "./Audience";
import { CodeText } from "./CodeText";
import { ConstantDocsDemo, ConstantDocsPrintDemo } from "./ConstantDocsDemo";
import { Description } from "./Description";
import { Figure } from "./Figure";
import { Flow } from "./Flow";
import { type IntroItem, IntroTable } from "./IntroTable";
import { type DocsMenu, Layout } from "./Layout";
import { LinkGrid, type LinkGridItem } from "./LinkGrid";
import { Matrix, type MatrixColumn, type MatrixGroup, type MatrixRow } from "./Matrix";
import { NotFound } from "./NotFound";
import { type OptionItem, OptionTable } from "./OptionTable";
import { Search } from "./Search";
import { Sequence } from "./Sequence";
import { SubSubTitle } from "./SubSubTitle";
import { SubTitle } from "./SubTitle";
import { Table, type TableColumn } from "./Table";
import { Title } from "./Title";

export const Docs = {
  Layout,
  Title,
  Description,
  Figure,
  Flow,
  Sequence,
  SubTitle,
  SubSubTitle,
  OptionTable,
  IntroTable,
  Table,
  Matrix,
  LinkGrid,
  Alert,
  CodeSnippet,
  CodeText,
  Search,
  NotFound,
};
export type {
  Audience,
  DocsMenu,
  IntroItem,
  LinkGridItem,
  MatrixColumn,
  MatrixGroup,
  MatrixRow,
  OptionItem,
  TableColumn,
};
export { AgentVisualDemo, ConstantDocsDemo, ConstantDocsPrintDemo };
