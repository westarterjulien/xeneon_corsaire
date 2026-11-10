import { createContext, useContext } from "react";

export interface Theme {
  accent: string;
  background: string;
}

export const ThemeContext = createContext<Theme>({ accent: "#a9c4ff", background: "#07090c" });
export const useTheme = () => useContext(ThemeContext);
