/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#04050d",
          900: "#070a1a",
          850: "#0a0e24",
          800: "#0e1430",
          700: "#161d42",
          600: "#222b5a",
        },
        neon: {
          blue: "#2ee6ff",
          sky: "#3b82f6",
          violet: "#8b5cf6",
          purple: "#b14dff",
          pink: "#ff4fd8",
        },
      },
      fontFamily: {
        display: ["Unbounded", "system-ui", "sans-serif"],
        sans: ["Manrope", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(46,230,255,0.55), 0 0 48px -12px rgba(139,92,246,0.6)",
        "glow-sm": "0 0 14px -4px rgba(46,230,255,0.5)",
        "glow-violet": "0 0 28px -6px rgba(177,77,255,0.65)",
        card: "0 10px 30px -12px rgba(0,0,0,0.7)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "100%": { transform: "scale(1.35)", opacity: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up .45s cubic-bezier(.2,.8,.2,1) both",
        shimmer: "shimmer 4s linear infinite",
        float: "float 4s ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.8s ease-out infinite",
      },
    },
  },
  plugins: [],
};
