/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono Variable"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        ink: { 950: "#06080c", 900: "#0a0e14", 850: "#0e131b", 800: "#121822", 700: "#1a2230", 600: "#243042", 500: "#33425a" },
        cage: { 300: "#7ff5dd", 400: "#3fe0c0", 500: "#14c7a5", 600: "#0ea387" },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(63,224,192,.25), 0 8px 40px -8px rgba(63,224,192,.35)",
        danger: "0 0 0 1px rgba(248,113,113,.3), 0 8px 40px -8px rgba(248,113,113,.4)",
      },
      keyframes: {
        scan: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(100%)" } },
        pulseRing: { "0%": { boxShadow: "0 0 0 0 rgba(63,224,192,.6)" }, "100%": { boxShadow: "0 0 0 10px rgba(63,224,192,0)" } },
      },
      animation: { scan: "scan 2.2s linear infinite", pulseRing: "pulseRing 1.2s ease-out infinite" },
    },
  },
  plugins: [],
};
