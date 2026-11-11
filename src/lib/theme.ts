export type ThemeMode = 'system' | 'light' | 'dark';

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = localStorage.getItem('platform_theme') as ThemeMode;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch (e) {
    console.error("Error reading platform_theme:", e);
  }
  return 'system';
}

export function applyTheme(mode: ThemeMode) {
  if (typeof window === 'undefined') return;
  try {
    const root = document.documentElement;
    const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effectiveDark = mode === 'dark' || (mode === 'system' && isSystemDark);
    
    localStorage.setItem('platform_theme', mode);
    root.setAttribute('data-theme', mode);
    
    if (effectiveDark) {
      root.classList.add('dark');
      root.classList.remove('light');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  } catch (e) {
    console.error("Error applying theme:", e);
  }
}

export function initThemeListener(onThemeChange?: (mode: ThemeMode) => void) {
  if (typeof window === 'undefined') return () => {};
  
  // Apply initially stored theme
  const initialTheme = getStoredTheme();
  applyTheme(initialTheme);

  // Listen for OS system preference changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = () => {
    const currentMode = getStoredTheme();
    if (currentMode === 'system') {
      applyTheme('system');
    }
    if (onThemeChange) {
      onThemeChange(currentMode);
    }
  };

  mediaQuery.addEventListener('change', handleChange);
  return () => mediaQuery.removeEventListener('change', handleChange);
}

// Run immediately on module load to prevent brief layout flashes of wrong color mode
if (typeof window !== 'undefined') {
  try {
    applyTheme(getStoredTheme());
  } catch (e) {
    console.error("Error applying initial theme in module load:", e);
  }
}
