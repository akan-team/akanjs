"use client";
import { Any, Int } from "akanjs/base";
import { st } from "akanjs/store";

interface PageToolOptions {
  /** Null publishes nothing: a single page draws no pager. */
  name: string | null;
  model: string;
  page: number;
  lastPage: number;
  total: number;
  onSelect: (page: number) => void;
}

/** The page count rides the guard and the resource: the description is read once, at mount. */
export const usePageTool = ({ name, model, page, lastPage, total, onSelect }: PageToolOptions) => {
  st.expose(name ? `pagesOf${model.charAt(0).toUpperCase()}${model.slice(1)}` : null, Any)
    .desc(`Where the ${model} list is paged to.`)
    .value({ page, lastPage, total });
  return st
    .tool(name, {
      taint: "exempt",
      guard: ({ page }) =>
        Number(page) >= 1 && Number(page) <= lastPage
          ? true
          : `The ${model} list has ${lastPage} page${lastPage === 1 ? "" : "s"}.`,
    })
    .desc(`Turn the ${model} list to one page.`)
    .arg("page", Int)
    .exec(onSelect);
};
