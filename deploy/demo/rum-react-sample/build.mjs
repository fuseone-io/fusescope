import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: true,
  keepNames: true,
  jsx: 'automatic',
  outfile: 'dist/app.js',
  define: { 'process.env.NODE_ENV': '"production"' },
});
