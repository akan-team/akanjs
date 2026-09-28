"use client";
import { pageActivityContext } from "akanjs/client";
import { useContext } from "react";

/** Where this page stands in the CSR stack. Outside one — SSR, a layout, a plain web page — it is always `current`. */
export const usePageActivity = () => useContext(pageActivityContext).activity;
