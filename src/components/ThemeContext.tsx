import SeasonalProvider, {
  useTheme as useSeasonalTheme,
} from "../contexts/ThemeProvider.js";

// Re-export a thin compatibility layer so existing code that imports
// from "./components/ThemeContext.js" continues to work.
export const ThemeProvider = SeasonalProvider;
export const useTheme = useSeasonalTheme;

export default ThemeProvider;
