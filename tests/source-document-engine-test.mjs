import { SourceDocumentEngine } from '../src/renderer/core/source-document-engine.mjs';

const commits = [];
const engine = new SourceDocumentEngine(html => html.replace(/<[^>]+>/g, ''), doc => commits.push({ source: doc.content, revision: doc.sourceRevision }));
const doc = { content: '第一行', dirty: false };

if (!engine.commitRenderedEdit(doc, '<p>第一行</p><p>第二行</p>', true)) throw new Error('渲染编辑没有同步提交源码');
if (doc.content !== '第一行第二行' || doc.sourceRevision !== 1 || doc.lastTransaction.origin !== 'rendered-edit') throw new Error('渲染事务没有以源码为权威状态');
if (!engine.commitSource(doc, '第一行\n第二行', true)) throw new Error('源码事务没有提交');
if (doc.content !== '第一行\n第二行' || doc.sourceRevision !== 2 || doc.lastTransaction.origin !== 'source') throw new Error('源码事务顺序或版本错误');
if (engine.commitSource(doc, doc.content, true)) throw new Error('相同源码不应产生新事务');
if ('visualHtml' in doc || 'pendingVisual' in doc || 'syncPromise' in doc) throw new Error('文档模型仍然保存渲染 DOM 或异步转换状态');
if (commits.length !== 2) throw new Error('提交回调次数错误');

console.log(JSON.stringify({ sourceOnly: true, synchronous: true, revisioned: true, commits: commits.length }));
