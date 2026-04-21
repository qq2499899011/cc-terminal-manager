import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

// Post-build plugin: fix HTML for Electron file:// loading
// - strip crossorigin attributes
// - replace type="module" with regular script (IIFE format)
function fixElectronHtml() {
  return {
    name: 'fix-electron-html',
    closeBundle() {
      const htmlPath = path.resolve(__dirname, 'dist-renderer', 'index.html');
      if (fs.existsSync(htmlPath)) {
        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace(/ crossorigin/g, '');
        html = html.replace(/ type="module"/g, '');
        // Add defer so script runs after DOM is parsed
        html = html.replace(/<script src=/g, '<script defer src=');
        fs.writeFileSync(htmlPath, html, 'utf8');
      }
    },
  };
}

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist-renderer'),
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'assets/[name]-[hash].js',
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [fixElectronHtml()],
  server: {
    port: 5173,
  },
});
