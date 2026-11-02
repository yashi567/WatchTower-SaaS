import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { Workspace } from "../../shared/types";
export interface ProductContext {
  demo: boolean;
  workspace?: Workspace;
  workspaces: Workspace[];
  setWorkspace: (id: string) => void;
  refreshWorkspaces: () => void;
  user?: { id: string; name: string; email: string; image?: string | null };
}
export const AppContext = createContext<ProductContext>({
  demo: true,
  workspaces: [],
  setWorkspace: () => {},
  refreshWorkspaces: () => {},
});
export const useProduct = () => useContext(AppContext);
const ThemeContext = createContext({ theme: "dark", toggle: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("watchtower-theme") ?? "dark",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("watchtower-theme", theme);
  }, [theme]);
  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);
