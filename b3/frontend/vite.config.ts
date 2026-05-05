import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        // Default to the LIVE deployed TEE agent on EigenCompute.
        // Override with `VITE_API_URL=http://127.0.0.1:3000 npm run dev` to
        // hit the local backend instead.
        target: process.env.VITE_API_URL || "https://34-126-104-240.nip.io",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
