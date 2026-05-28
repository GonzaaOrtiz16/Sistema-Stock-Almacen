import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'
import pkg from './package.json'

const externals = ['electron', ...Object.keys(pkg.dependencies)]

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            sourcemap: true,
            outDir: 'dist-electron',
            rollupOptions: {
              external: externals,
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            sourcemap: 'inline',
            outDir: 'dist-electron',
            rollupOptions: {
              external: externals,
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
