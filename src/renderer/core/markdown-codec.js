import { createMarkdownCodec } from '../../shared/markdown-codec.mjs';

export class MarkdownCodec {
  constructor() {
    if (!window.TurndownService) throw new Error('Markdown 编解码器未加载');
    this.codec = createMarkdownCodec(window.TurndownService, window.turndownPluginGfm?.gfm);
  }

  toMarkdown(html) { return this.codec.toMarkdown(html); }
}
