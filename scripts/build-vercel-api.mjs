import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

await build({
  entryPoints: [path.join(rootDir, 'src/vercel-handler.ts')],
  outfile: path.join(rootDir, 'api/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  packages: 'external',
  sourcemap: false,
  banner: {
    js: '// Auto-generated Vercel Serverless API bundle from src/vercel-handler.ts',
  },
});

console.log('Built Vercel serverless bundle: api/index.js');
