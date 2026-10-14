const path = require('node:path');

class ExternalOpenCoordinator {
  constructor(extensions) {
    this.extensions = new Set(extensions.map(extension => `.${String(extension).replace(/^\./, '').toLowerCase()}`));
    this.pending = [];
  }

  enqueue(argumentsList = []) {
    for (const argument of argumentsList) {
      if (typeof argument !== 'string' || !this.extensions.has(path.extname(argument).toLowerCase())) continue;
      const filePath = path.resolve(argument);
      if (!this.pending.includes(filePath)) this.pending.push(filePath);
    }
    return this.pending.length;
  }

  take() {
    return this.pending.splice(0);
  }
}

module.exports = { ExternalOpenCoordinator };
