import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' permite publicar en GitHub Pages bajo /<repositorio>/ sin configurar nada más.
export default defineConfig({
  base: './',
  plugins: [react()],
});
