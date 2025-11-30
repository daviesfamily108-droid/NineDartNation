import SeasonalProvider, { useTheme as useSeasonalTheme } from '../contexts/ThemeProvider';

// Re-export a thin compatibility layer so existing code that imports
// from "./components/ThemeContext" continues to work.
export const ThemeProvider = SeasonalProvider;
export const useTheme = useSeasonalTheme;

export default ThemeProvider;
