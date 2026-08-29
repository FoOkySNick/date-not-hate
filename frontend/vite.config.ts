import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({ registerType: 'autoUpdate', strategies: 'injectManifest', srcDir: 'src', filename: 'sw.js', manifest: { name: 'Date, not Hate', short_name: 'DateNotHate', description: 'Свидания без повода для ссоры', theme_color: '#f9ecee', background_color: '#fffafa', display: 'standalone', lang: 'ru', icons: [{ src: '/heart.svg', sizes: '192x192', type: 'image/svg+xml' }] } })],
  server: { proxy: { '/api': 'http://localhost:3001', '/photos': 'http://localhost:3001' } }
});
