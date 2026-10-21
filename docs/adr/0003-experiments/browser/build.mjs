import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out);

const kb = (n) => (n / 1024).toFixed(1);
const sizes = (file) => {
  const buf = readFileSync(file);
  return {
    min: buf.length,
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
};

const pkgOf = (path) => {
  const m = path.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  return m ? m[1] : 'src (FuseScope modules)';
};

const rows = [];
const breakdown = {};
for (const entry of readdirSync('entries').filter((f) => f.endsWith('.ts')).sort()) {
  const name = basename(entry, '.ts');
  const outdir = join(out, name);
  const result = await build({
    entryPoints: [join('entries', entry)],
    bundle: true,
    minify: true,
    format: 'esm',
    splitting: true,
    target: 'es2020',
    outdir,
    metafile: true,
    legalComments: 'none',
    logLevel: 'warning',
  });
  writeFileSync(join(outdir, 'meta.json'), JSON.stringify(result.metafile));
  const outputs = Object.entries(result.metafile.outputs).filter(([f]) => f.endsWith('.js'));
  // Initial = the entry chunk plus every chunk it imports statically.
  const initial = new Set();
  const visit = (file) => {
    if (initial.has(file)) return;
    initial.add(file);
    for (const imp of result.metafile.outputs[file].imports) if (imp.kind === 'import-statement') visit(imp.path);
  };
  visit(outputs.find(([, o]) => o.entryPoint)[0]);
  const s = [...initial].map(sizes).reduce((a, b) => ({ min: a.min + b.min, gzip: a.gzip + b.gzip, brotli: a.brotli + b.brotli }));
  const lazyGzip = outputs.filter(([f]) => !initial.has(f)).reduce((acc, [f]) => acc + sizes(f).gzip, 0);
  rows.push({ name, ...s, lazyGzip, chunks: initial.size });

  const perPkg = {};
  for (const [, o] of outputs) {
    for (const [input, { bytesInOutput }] of Object.entries(o.inputs)) {
      perPkg[pkgOf(input)] = (perPkg[pkgOf(input)] ?? 0) + bytesInOutput;
    }
  }
  breakdown[name] = perPkg;
}

console.log('Initial = entry chunk + statically imported chunks, each compressed separately.\n');
console.log('| bundle | initial min KB | initial gzip KB | initial brotli KB | lazy chunks gzip KB |');
console.log('|---|---:|---:|---:|---:|');
for (const r of rows) {
  console.log(`| ${r.name} | ${kb(r.min)} | ${kb(r.gzip)} | ${kb(r.brotli)} | ${r.lazyGzip ? kb(r.lazyGzip) : '—'} |`);
}
for (const name of ['core', 'full']) {
  const total = Object.values(breakdown[name]).reduce((a, b) => a + b, 0);
  console.log(`\n${name}: minified bytes per package`);
  console.log('| package | min KB | share |');
  console.log('|---|---:|---:|');
  for (const [pkg, bytes] of Object.entries(breakdown[name]).sort((a, b) => b[1] - a[1])) {
    console.log(`| ${pkg} | ${kb(bytes)} | ${((bytes / total) * 100).toFixed(0)}% |`);
  }
}
writeFileSync(join(out, 'sizes.json'), JSON.stringify({ rows, breakdown }, null, 2));
