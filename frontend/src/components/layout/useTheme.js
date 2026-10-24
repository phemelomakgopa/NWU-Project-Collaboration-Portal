import { useCallback, useEffect, useState } from 'react';

const KEY = 'pcp-theme';

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function savedTheme() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/** Light/dark theme that follows the system until the person picks one. */
export default function useTheme() {
  const [theme, setTheme] = useState(() => savedTheme() || systemTheme());

  useEffect(() => {
    if (savedTheme()) return undefined;
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return undefined;
    const onChange = () => setTheme(systemTheme());
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* storage unavailable: the choice lasts for this visit */
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}
