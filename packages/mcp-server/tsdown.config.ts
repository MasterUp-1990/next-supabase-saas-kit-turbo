import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'build',
  target: 'es2024',
  platform: 'node',
  dts: false,
  clean: true,
  format: ['cjs'],
});
