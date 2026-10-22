import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Each folder under the site root is its own page: / is the coffee home, /sip/ is Sip Log
// with Maitha and /sip/viva/ is Sip Log with Viva.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, "index.html"),
        sip: resolve(import.meta.dirname, "sip/index.html"),
        viva: resolve(import.meta.dirname, "sip/viva/index.html"),
      },
    },
  },
});
