import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // Lovable Cloud backend – these are public/publishable values
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
      process.env.VITE_SUPABASE_URL || 'https://ebvkidlygxquueasakvh.supabase.co'
    ),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVidmtpZGx5Z3hxdXVlYXNha3ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NTExNTAsImV4cCI6MjA4NzIyNzE1MH0.I6oudRCUfILmnr3Q51uGNKIc2ZH-X13W4nRlhLVI_ss'
    ),
    'import.meta.env.VITE_SUPABASE_PROJECT_ID': JSON.stringify(
      process.env.VITE_SUPABASE_PROJECT_ID || 'ebvkidlygxquueasakvh'
    ),
  },
}));
