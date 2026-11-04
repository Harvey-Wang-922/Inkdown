import { normalizeTheme } from '../../shared/theme-policy.mjs';

// Display-only state; theme changes never touch document Markdown or history.
export class ThemeController {
  constructor({ root, body, setNativeTheme, onError = () => {} }) {
    Object.assign(this, { root, body, setNativeTheme, onError });
    this.revision = 0; this.preference = 'system';
  }
  async apply(value) {
    const preference = this.preference = normalizeTheme(value), revision = ++this.revision;
    try {
      const resolved = await this.setNativeTheme(preference);
      if (revision !== this.revision) return false;
      const theme = preference === 'sepia' ? 'sepia' : resolved;
      this.body.classList.toggle('theme-dark', theme === 'dark');
      this.body.classList.toggle('theme-sepia', theme === 'sepia');
      this.root.style.setProperty('color-scheme', theme === 'dark' ? 'dark' : 'light');
      return true;
    } catch (error) {
      if (revision === this.revision) this.onError(error);
      return false;
    }
  }
  refreshSystem() {
    if (this.preference === 'system') return this.apply('system');
    return Promise.resolve(false);
  }
}
