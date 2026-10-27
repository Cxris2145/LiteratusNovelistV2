// Local, bounded metadata-only minidump inspection. Does not read memory/thread streams.
// Crashpad layout: https://github.com/chromium/crashpad/blob/main/minidump/minidump_extensions.h
import fs from 'node:fs';
import path from 'node:path';

function inspect(file) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const read = (offset, length) => {
    if (!Number.isSafeInteger(offset) || offset < 0 || length < 0 || length > 65536 || offset + length > size) throw new Error('Invalid metadata range');
    const b = Buffer.alloc(length);
    fs.readSync(fd, b, 0, length, offset);
    return b;
  };
  const u32 = offset => read(offset, 4).readUInt32LE();
  const textAt = (rva, encoding = 'utf8', cap = 32768) => {
    const n = u32(rva);
    if (n > cap) return '';
    return read(rva + 4, n).toString(encoding).replace(/\0+$/, '');
  };
  const header = read(0, 32);
  if (header.toString('ascii', 0, 4) !== 'MDMP') throw new Error('Not a minidump');
  const count = header.readUInt32LE(8);
  if (count > 128) throw new Error('Unexpected stream count');
  const streams = new Map();
  const directory = read(header.readUInt32LE(12), count * 12);
  for (let i = 0; i < count; i++) streams.set(directory.readUInt32LE(i * 12), { length: directory.readUInt32LE(i * 12 + 4), rva: directory.readUInt32LE(i * 12 + 8) });
  const out = { dump: path.basename(file), timestamp: new Date(header.readUInt32LE(20) * 1000).toISOString(), modules: 0, diagnosticAnnotations: [] };
  const modules = [];
  const modStream = streams.get(4);
  if (modStream) {
    const n = u32(modStream.rva);
    if (n > 2048) throw new Error('Unexpected module count');
    for (let i = 0; i < n; i++) {
      const b = read(modStream.rva + 4 + i * 108, 108);
      const base = b.readBigUInt64LE();
      const moduleSize = BigInt(b.readUInt32LE(8));
      const name = path.win32.basename(textAt(b.readUInt32LE(20), 'utf16le', 4096));
      modules.push({ name, base, end: base + moduleSize });
    }
    out.modules = modules.length;
  }
  const exception = streams.get(6);
  if (exception) {
    const b = read(exception.rva, Math.min(exception.length, 40));
    const address = b.readBigUInt64LE(24);
    const module = modules.find(m => address >= m.base && address < m.end);
    out.exceptionCode = '0x' + b.readUInt32LE(8).toString(16);
    out.exceptionAddress = '0x' + address.toString(16);
    out.faultModule = module?.name ?? null;
    out.faultOffset = module ? '0x' + (address - module.base).toString(16) : null;
  }
  const diagnostic = (key, value) => {
    if (/^(?:ptype|process[-_]?type)$/i.test(key)) {
      out.processType = /^[a-z0-9_-]{1,50}$/i.test(value) ? value : 'unrecognized';
    } else if (/^(?:ver|prod|channel)$/i.test(key)) {
      if (/^[a-z0-9. _-]{1,80}$/i.test(value)) out[key] = value;
    } else if (/check|fatal|crash[-_]?reason/i.test(key)) {
      const loc = value.match(/(?:^|[\\/\s])([a-zA-Z0-9_.-]+\.(?:cc|cpp|c|h))(?::|\()(\d+)/);
      out.diagnosticAnnotations.push({
        key: key.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 80),
        checkFailed: /check failed/i.test(value),
        source: loc ? `${loc[1]}:${loc[2]}` : null,
        mentionsAutofill: /autofill/i.test(value),
        mentionsPassword: /password/i.test(value),
        mentionsGpu: /gpu|d3d|direct3d|vulkan|skia/i.test(value),
        mentionsOutOfMemory: /out.of.memory|oom|allocation failed/i.test(value),
      });
    }
  };
  const eligible = key => /^(?:ptype|process[-_]?type|ver|prod|channel)$/i.test(key) || /check|fatal|crash[-_]?reason/i.test(key);
  const dictionary = rva => {
    if (!rva) return;
    const n = u32(rva);
    if (n > 4096) throw new Error('Unexpected annotation count');
    for (let i = 0; i < n; i++) {
      const b = read(rva + 4 + i * 8, 8);
      const key = textAt(b.readUInt32LE(), 'utf8', 256);
      if (eligible(key)) diagnostic(key, textAt(b.readUInt32LE(4)));
    }
  };
  const objects = rva => {
    if (!rva) return;
    const n = u32(rva);
    if (n > 4096) throw new Error('Unexpected annotation object count');
    for (let i = 0; i < n; i++) {
      const b = read(rva + 4 + i * 12, 12);
      const key = textAt(b.readUInt32LE(), 'utf8', 256);
      if (b.readUInt16LE(4) === 1 && eligible(key)) diagnostic(key, textAt(b.readUInt32LE(8)));
    }
  };
  const crashpad = streams.get(0x43500001);
  if (crashpad && crashpad.length >= 52) {
    const b = read(crashpad.rva, 52);
    dictionary(b.readUInt32LE(40));
    const list = b.readUInt32LE(48);
    if (list) {
      const n = u32(list);
      if (n > 2048) throw new Error('Unexpected module annotation count');
      for (let i = 0; i < n; i++) {
        const link = read(list + 4 + i * 12, 12);
        const length = link.readUInt32LE(4);
        const info = read(link.readUInt32LE(8), Math.min(length, 28));
        if (info.length >= 20) dictionary(info.readUInt32LE(16));
        if (info.length >= 28) objects(info.readUInt32LE(24));
      }
    }
  }
  fs.closeSync(fd);
  return out;
}
for (const file of process.argv.slice(2)) console.log(JSON.stringify(inspect(file), null, 2));
