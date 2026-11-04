export function normalizeTheme(value) {
  return ['light', 'dark', 'sepia', 'system'].includes(value) ? value : 'system';
}
export function nativeThemeSource(value) {
  return value === 'sepia' ? 'light' : value;
}
