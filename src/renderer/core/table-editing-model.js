export class TableEditingModel {
  constructor(editor, caretModel, onChange = null) {
    this.editor = editor;
    this.caretModel = caretModel;
    this.onChange = onChange;
    this.activeCell = null;
  }

  cellFromNode(node = null) {
    node ||= window.getSelection()?.anchorNode;
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const cell = element?.closest?.('th,td') || null;
    return cell && this.editor.contains(cell) ? cell : null;
  }

  context(node = null, allowRemembered = false) {
    const cell = this.cellFromNode(node) || (allowRemembered && this.activeCell?.isConnected ? this.activeCell : null);
    if (!cell) return null;
    this.activeCell = cell;
    const table = cell.closest('table');
    const row = cell.parentElement;
    const rows = [...table.rows];
    return { table, cell, row, rows, rowIndex: rows.indexOf(row), columnIndex: [...row.cells].indexOf(cell) };
  }

  activateCell(cell, atStart = true) {
    if (!cell) return false;
    if (cell.matches?.('th,td')) this.activeCell = cell;
    this.editor.focus({ preventScroll: true });
    this.caretModel.place(cell, atStart);
    return true;
  }

  ensureBody(table) {
    return table.tBodies[0] || table.appendChild(document.createElement('tbody'));
  }

  columnCount(table) {
    return Math.max(1, ...[...table.rows].map(row => row.cells.length));
  }

  createCell(tagName = 'td') {
    const cell = document.createElement(tagName);
    cell.innerHTML = '<br>';
    return cell;
  }

  createRow(table, tagName = 'td') {
    const row = document.createElement('tr');
    for (let index = 0; index < this.columnCount(table); index++) row.append(this.createCell(tagName));
    return row;
  }

  commit(targetCell = null, atStart = true) {
    if (targetCell) this.activateCell(targetCell, atStart);
    this.onChange?.(targetCell);
    return true;
  }

  navigate(backwards = false) {
    const context = this.context(null, true);
    if (!context) return false;
    const cells = [...context.table.querySelectorAll('th,td')];
    let target = cells[cells.indexOf(context.cell) + (backwards ? -1 : 1)];
    if (!target && !backwards) {
      const row = this.createRow(context.table);
      this.ensureBody(context.table).append(row);
      target = row.cells[0];
      return this.commit(target);
    }
    return this.activateCell(target, !backwards);
  }

  moveVertical(direction = 1) {
    const context = this.context(null, true);
    if (!context) return false;
    let targetRow = context.rows[context.rowIndex + direction];
    if (!targetRow && direction > 0) {
      targetRow = this.createRow(context.table);
      this.ensureBody(context.table).append(targetRow);
      return this.commit(targetRow.cells[Math.min(context.columnIndex, targetRow.cells.length - 1)]);
    }
    return this.activateCell(targetRow?.cells[Math.min(context.columnIndex, targetRow.cells.length - 1)], direction > 0);
  }

  insertRow(position = 'after') {
    const context = this.context(null, true);
    if (!context) return false;
    const row = this.createRow(context.table);
    if (context.row.parentElement?.tagName === 'THEAD') this.ensureBody(context.table).prepend(row);
    else if (position === 'before') context.row.before(row);
    else context.row.after(row);
    return this.commit(row.cells[Math.min(context.columnIndex, row.cells.length - 1)]);
  }

  deleteRow() {
    const context = this.context(null, true);
    if (!context || context.row.parentElement?.tagName === 'THEAD') return false;
    const bodyRows = [...this.ensureBody(context.table).rows];
    if (bodyRows.length <= 1) {
      [...context.row.cells].forEach(cell => { cell.innerHTML = '<br>'; });
      return this.commit(context.row.cells[Math.min(context.columnIndex, context.row.cells.length - 1)]);
    }
    const targetRow = bodyRows[bodyRows.indexOf(context.row) + 1] || bodyRows[bodyRows.indexOf(context.row) - 1];
    context.row.remove();
    return this.commit(targetRow.cells[Math.min(context.columnIndex, targetRow.cells.length - 1)]);
  }

  insertColumn(position = 'after') {
    const context = this.context(null, true);
    if (!context) return false;
    const insertAt = context.columnIndex + (position === 'after' ? 1 : 0);
    for (const row of context.rows) {
      const tag = row.parentElement?.tagName === 'THEAD' ? 'th' : 'td';
      const cell = this.createCell(tag);
      row.insertBefore(cell, row.cells[insertAt] || null);
    }
    return this.commit(context.table.rows[context.rowIndex].cells[insertAt]);
  }

  deleteColumn() {
    const context = this.context(null, true);
    if (!context) return false;
    if (this.columnCount(context.table) <= 1) return this.deleteTable();
    for (const row of context.rows) row.cells[context.columnIndex]?.remove();
    const target = context.table.rows[context.rowIndex].cells[Math.min(context.columnIndex, context.table.rows[context.rowIndex].cells.length - 1)];
    return this.commit(target);
  }

  alignColumn(alignment = '') {
    const context = this.context(null, true);
    if (!context) return false;
    for (const row of context.rows) {
      const cell = row.cells[context.columnIndex];
      if (!cell) continue;
      if (alignment) cell.setAttribute('align', alignment);
      else cell.removeAttribute('align');
    }
    return this.commit(context.cell);
  }

  resize(rowCount, columnCount) {
    const context = this.context(null, true);
    if (!context) return false;
    const rows = Math.max(1, Math.min(100, Number(rowCount) || 1));
    const columns = Math.max(1, Math.min(30, Number(columnCount) || 1));
    const body = this.ensureBody(context.table);
    while (body.rows.length < rows) body.append(this.createRow(context.table));
    while (body.rows.length > rows) body.lastElementChild.remove();
    for (const row of context.table.rows) {
      while (row.cells.length < columns) row.append(this.createCell(row.parentElement?.tagName === 'THEAD' ? 'th' : 'td'));
      while (row.cells.length > columns) row.lastElementChild.remove();
    }
    return this.commit(context.table.rows[Math.min(context.rowIndex, context.table.rows.length - 1)].cells[Math.min(context.columnIndex, columns - 1)]);
  }

  deleteTable() {
    const context = this.context(null, true);
    if (!context) return false;
    const paragraph = document.createElement('p');
    paragraph.innerHTML = '<br>';
    context.table.replaceWith(paragraph);
    this.activeCell = null;
    return this.commit(paragraph);
  }

  selectCell() {
    const context = this.context(null, true);
    if (!context) return false;
    const range = document.createRange(); range.selectNodeContents(context.cell);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    return true;
  }

  selectRow() {
    const context = this.context(null, true);
    if (!context) return false;
    const range = document.createRange(); range.setStart(context.row.cells[0], 0); range.setEnd(context.row.cells[context.row.cells.length - 1], context.row.cells[context.row.cells.length - 1].childNodes.length);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    return true;
  }

  handleKeydown(event) {
    if (!this.context()) return false;
    const ctrl = event.ctrlKey || event.metaKey;
    if (event.key === 'Tab' && !event.altKey) {
      event.preventDefault(); this.navigate(event.shiftKey); return true;
    }
    if (ctrl && event.key === 'Enter') {
      event.preventDefault(); this.insertRow('after'); return true;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); this.moveVertical(1); return true;
    }
    if (ctrl && event.shiftKey && event.key === 'Backspace') {
      event.preventDefault(); this.deleteRow(); return true;
    }
    if (ctrl && !event.shiftKey && event.code === 'KeyE') {
      event.preventDefault(); this.selectCell(); return true;
    }
    if (ctrl && !event.shiftKey && event.code === 'KeyL') {
      event.preventDefault(); this.selectRow(); return true;
    }
    return false;
  }

  pasteMatrix(text) {
    if (!/[\t\r\n]/.test(text)) return false;
    const context = this.context(null, true);
    if (!context) return false;
    const matrix = String(text).replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(row => row.split('\t'));
    const targetRows = context.rowIndex + matrix.length;
    const targetColumns = context.columnIndex + Math.max(...matrix.map(row => row.length));
    const body = this.ensureBody(context.table);
    while (context.table.rows.length < targetRows) body.append(this.createRow(context.table));
    for (const row of context.table.rows) {
      while (row.cells.length < targetColumns) row.append(this.createCell(row.parentElement?.tagName === 'THEAD' ? 'th' : 'td'));
    }
    matrix.forEach((values, rowOffset) => values.forEach((value, columnOffset) => {
      const cell = context.table.rows[context.rowIndex + rowOffset].cells[context.columnIndex + columnOffset];
      if (value) cell.textContent = value;
      else cell.innerHTML = '<br>';
    }));
    const lastRow = context.table.rows[context.rowIndex + matrix.length - 1];
    const lastCell = lastRow.cells[context.columnIndex + matrix.at(-1).length - 1];
    return this.commit(lastCell, false);
  }

  execute(command, value = null) {
    const actions = {
      'row-before': () => this.insertRow('before'), 'row-after': () => this.insertRow('after'), 'row-delete': () => this.deleteRow(),
      'column-before': () => this.insertColumn('before'), 'column-after': () => this.insertColumn('after'), 'column-delete': () => this.deleteColumn(),
      'align-default': () => this.alignColumn(''), 'align-left': () => this.alignColumn('left'), 'align-center': () => this.alignColumn('center'), 'align-right': () => this.alignColumn('right'),
      resize: () => this.resize(value?.rows, value?.columns), delete: () => this.deleteTable()
    };
    return actions[command]?.() || false;
  }
}
