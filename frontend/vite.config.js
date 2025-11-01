// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Nếu muốn proxy API khi dev, mở comment bên dưới và chỉnh path cho đúng:
  // server: {
  //   proxy: {
  //     "/tro-choi": "http://127.0.0.1:8000",
  //     "/auth": "http://127.0.0.1:8000",
  //   },
  // },
});
