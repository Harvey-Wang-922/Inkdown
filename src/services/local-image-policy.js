const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_EXPORT_IMAGE_BYTES = 64 * 1024 * 1024;
const MIME_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
function within(root, target) {
  const relative = path.relative(root, target);
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}
function imageMime(data) {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(data.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

async function localImageData(source, documentPath, remaining = MAX_EXPORT_IMAGE_BYTES) {
  if (!documentPath || !source || source.includes('\0')) return null;
  let handle;
  try {
    const root = await fs.realpath(path.dirname(documentPath));
    const requested = /^file:/i.test(source) ? fileURLToPath(source) : path.resolve(root, decodeURIComponent(source));
    const real = await fs.realpath(requested);
    if (!within(root, real)) return null;
    const mime = MIME_TYPES[path.extname(real).toLowerCase()];
    if (!mime) return null;
    handle = await fs.open(real, 'r');
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > Math.min(MAX_IMAGE_BYTES, remaining) || stat.size < 12) return null;
    const header = Buffer.alloc(12);
    await handle.read(header, 0, header.length, 0);
    if (imageMime(header) !== mime) return null;
    // Read only the bounded size, even if the file grows after fstat.
    const data = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < data.length) {
      const { bytesRead } = await handle.read(data, offset, data.length - offset, offset);
      if (!bytesRead) return null;
      offset += bytesRead;
    }
    return { bytes: data.length, url: `data:${mime};base64,${data.toString('base64')}` };
  } catch { return null; }
  finally { await handle?.close(); }
}

function safeDataImage(source, remaining = MAX_EXPORT_IMAGE_BYTES) {
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z\d+/=\s]+)$/i.exec(source);
  if (!match || match[2].length > Math.min(MAX_IMAGE_BYTES, remaining) * 4 / 3 + 4) return null;
  const data = Buffer.from(match[2], 'base64');
  if (data.length > Math.min(MAX_IMAGE_BYTES, remaining) || imageMime(data) !== match[1].toLowerCase()) return null;
  return { bytes: data.length, url: `data:${match[1].toLowerCase()};base64,${data.toString('base64')}` };
}
module.exports = { localImageData, safeDataImage, MAX_IMAGE_BYTES, MAX_EXPORT_IMAGE_BYTES };
