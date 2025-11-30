# Theming (Seasonal Themes)

This project includes a lightweight theming system to support seasonal themes (Halloween, Easter, Summer, Christmas) and a default neutral theme.

How it works

- The app is wrapped by a `ThemeProvider` (`src/contexts/ThemeProvider.tsx`). It exposes `useTheme()` returning `{ theme, setTheme, auto, setAuto }`.
- The provider persists manual theme choice to `localStorage` key `ndn:theme`. Auto-mode preference is stored at `ndn:theme:auto`.
- CSS tokens are defined in `src/styles/themes.css`. Themes are applied by setting `data-theme` on the `<html>` element.
- In auto mode the provider picks a seasonal theme based on the current date. You can override this via Settings > Appearance.

Adding a new theme

1. Add CSS variables to `src/styles/themes.css` using the selector `[data-theme="your-theme-name"]`.
2. Add any static assets under `public/themes/your-theme-name/` and reference them from CSS via `url('/themes/your-theme-name/bg.png')`.
3. Update `src/contexts/ThemeProvider.tsx` to include the new theme name in the `ThemeName` union and optionally in the `ALL_THEMES` list used by the ThemeToggle.

Accessibility

- Respect users' `prefers-reduced-motion` and the app offers a Reduced Motion setting in Settings.
- Make sure color contrast remains sufficient for WCAG AA when creating new themes.

Developer notes

- For production-grade camera sharing between windows, use WebRTC rather than polling frames via BroadcastChannel.
- Optional animations should be toggleable and disabled when reduced motion is enabled.
