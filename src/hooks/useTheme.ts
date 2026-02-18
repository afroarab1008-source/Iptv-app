import { useEffect } from 'react';
import { useIPTVStore } from '../store/iptvStore';
import { setLanguage } from '../utils/i18n';

export function useTheme() {
  const theme = useIPTVStore((s) => s.theme);
  const accentColor = useIPTVStore((s) => s.accentColor);
  const tvMode = useIPTVStore((s) => s.tvMode);
  const language = useIPTVStore((s) => s.language);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--user-accent', accentColor);
  }, [accentColor]);

  useEffect(() => {
    document.documentElement.classList.toggle('tv-mode', tvMode);
  }, [tvMode]);

  useEffect(() => {
    setLanguage(language);
    document.documentElement.lang = language;
  }, [language]);
}
