// Projection has one transaction boundary through loading, installation and view activation.
export class EditorProjectionController {
  constructor({ coordinator, render, source, visual, pane, normalize, capture, activate, onError,
    nextFrame = callback => requestAnimationFrame(callback) }) {
    Object.assign(this, { coordinator, render, source, visual, pane, normalize, capture, activate, onError, nextFrame });
  }
  async project(doc, sourceMode, view = null) {
    const operation = this.coordinator.begin(doc?.id);
    if (!doc) return this.coordinator.finish(operation);
    const source = doc.content;
    const immediate = sourceMode || !source;
    let spans = null;
    try {
      if (sourceMode) this.source.value = source;
      else if (!source) {
        this.visual.innerHTML = '<p><br></p>';
        spans = [{ start: 0, end: 0, tag: 'P' }];
      } else {
        const result = await this.render(source);
        if (!this.coordinator.isCurrent(operation)) return false;
        this.visual.innerHTML = result.html || '<p><br></p>';
        spans = result.spans;
      }
      const activate = () => {
        if (!this.coordinator.isCurrent(operation)) return;
        if (!sourceMode) {
          // Formatting whitespace from rendering is not an editable paragraph.
          for (const node of [...this.visual.childNodes]) {
            if (node.nodeType === 3 && !node.nodeValue.trim()) node.remove();
          }
          this.normalize();
          this.capture(doc, spans);
        }
        if (view?.activate) {
          view.activate();
          this.pane.scrollTo({ top: view.scrollTop, behavior: 'instant' });
        } else this.activate(doc, sourceMode);
      };
      if (immediate) activate();
      else await new Promise((resolve, reject) => this.nextFrame(() => {
        try { activate(); resolve(); } catch (error) { reject(error); }
      }));
      return this.coordinator.finish(operation);
    } catch (error) {
      // A stale failure cannot switch another tab/mode or clear newer loading.
      if (!this.coordinator.finish(operation)) return false;
      this.onError(error, doc);
      return false;
    } finally {
      this.coordinator.release(operation);
    }
  }
}
