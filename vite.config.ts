import { defineConfig } from 'vite';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';

// IWSDK's dev plugin injects the IWER WebXR emulator so the game can be
// flown in a desktop browser without a headset. On a real Quest browser it
// stays out of the way and the native WebXR session is used.
export default defineConfig({
  // Relative, so the build works under GitHub Pages' /fff/ subpath.
  base: './',
  plugins: [iwsdkDev({ emulator: { device: 'metaQuest3' } })],
  server: { host: true, port: 5173 },
  build: { target: 'esnext' },
});
