const DATABASE = 'inkdown-recovery', KEY = 'session';

export class SessionRecoveryStorage {
  constructor({ database = globalThis.indexedDB, legacy = globalThis.localStorage, name = DATABASE } = {}) {
    this.database = database; this.legacy = legacy; this.name = name; this.connection = null;
  }
  open() {
    if (!this.connection) this.connection = new Promise((resolve, reject) => {
      const request = this.database.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
      request.onsuccess = () => {
        const connection = request.result;
        connection.onversionchange = () => { connection.close(); this.connection = null; };
        resolve(connection);
      };
      request.onerror = () => { this.connection = null; reject(request.error); };
      request.onblocked = () => { this.connection = null; reject(new Error('恢复数据库被其他窗口占用')); };
    });
    return this.connection;
  }
  async transaction(mode, operation) {
    const connection = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = connection.transaction('snapshots', mode);
      const request = operation(transaction.objectStore('snapshots'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error || request.error || new Error('恢复数据写入失败'));
    });
  }
  write(snapshot) { return this.transaction('readwrite', store => store.put(snapshot, KEY)); }
  async load() {
    const stored = await this.transaction('readonly', store => store.get(KEY));
    if (stored !== undefined) return stored;
    const serialized = this.legacy?.getItem('inkdown.session');
    if (!serialized) return null;
    const snapshot = JSON.parse(serialized);
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
    const migrated = await this.transaction('readwrite', store => {
      const request = store.get(KEY);
      let result;
      request.onsuccess = () => {
        result = request.result === undefined ? snapshot : request.result;
        if (request.result === undefined) store.put(snapshot, KEY);
      };
      return { get result() { return result; }, get error() { return request.error; } };
    });
    // The only legacy removal occurs after an atomic migration succeeds.
    this.legacy.removeItem('inkdown.session');
    return migrated;
  }
}

export class SessionRecoveryCoordinator {
  constructor({ storage, snapshot, onError, delay = 500,
    setTimer = (callback, ms) => globalThis.setTimeout(callback, ms), clearTimer = timer => globalThis.clearTimeout(timer) }) {
    Object.assign(this, { storage, snapshot, onError, delay, setTimer, clearTimer });
    this.timer = null; this.pending = Promise.resolve();
  }
  schedule() {
    this.clearTimer(this.timer);
    this.timer = this.setTimer(() => { this.timer = null; void this.flush().catch(error => this.onError?.(error)); }, this.delay);
  }
  flush() {
    this.clearTimer(this.timer); this.timer = null;
    const snapshot = this.snapshot();
    this.pending = this.pending.catch(() => {}).then(() => this.storage.write(snapshot));
    return this.pending;
  }
}
