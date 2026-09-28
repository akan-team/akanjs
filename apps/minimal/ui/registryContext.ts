import { createContext } from "react";

export const registryContextId = Math.random().toString(36).slice(2, 10);
export const RegistryContext = createContext(registryContextId);
