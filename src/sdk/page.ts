import { createContext, useContext } from "react";

export interface PageApi {
  index: number;
  count: number;
  names: string[];
  goTo: (index: number) => void;
}

export const PageContext = createContext<PageApi>({ index: 0, count: 1, names: ["Page 1"], goTo: () => {} });

/** Permet à un widget de naviguer entre les pages (ex. bouton « Page jeu »). */
export const usePages = () => useContext(PageContext);
