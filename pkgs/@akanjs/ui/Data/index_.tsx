"use client";
import { lazy } from "@akanjs/next";

export const CardList = lazy(() => import("./CardList"));
export const Dashboard = lazy(() => import("./Dashboard"));
export const Insight = lazy(() => import("./Insight"));
export const Item = lazy(() => import("./Item"));
export const ListContainer = lazy(() => import("./ListContainer"));
export const Pagination = lazy(() => import("./Pagination"));
export const TableList = lazy(() => import("./TableList"));
export const QueryMaker = lazy(() => import("./QueryMaker"));
