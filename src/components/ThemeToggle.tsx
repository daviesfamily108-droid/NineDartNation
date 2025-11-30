import React from 'react';
import { useTheme, ThemeName } from '../contexts/ThemeProvider';

const ALL_THEMES: ThemeName[] = ['default', 'halloween', 'easter', 'summer', 'christmas'];

export default function ThemeToggle() {
  const { theme, setTheme, auto, setAuto } = useTheme();

  return (
    <div className="theme-toggle" role="group" aria-label="Theme selector">
      <label style={{display:'flex',alignItems:'center',gap:8}}>
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => setAuto(!!e.target.checked)}
          aria-checked={auto}
        />
        <span>Auto seasonal theme</span>
      </label>

      <div style={{marginTop:8,display:'flex',gap:8,flexWrap:'wrap'}}>
        {ALL_THEMES.map((t) => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            disabled={auto}
            aria-pressed={theme === t}
            className={`btn btn-ghost theme-btn theme-${t}`}
            title={`Set ${t} theme`}
          >
            {t === 'default' ? 'Default' : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
