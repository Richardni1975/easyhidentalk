/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        dark: {
          50: "#f0f0f0",
          100: "#e0e0e0",
          200: "#c0c0c0",
          300: "#a0a0a0",
          400: "#808080",
          500: "#606060",
          600: "#404040",
          700: "#2a2a2a",
          800: "#1a1a1a",
          900: "#0f0f0f",
          950: "#080808",
        },
      },
      animation: {
        "emoji-float": "emoji-float 2s ease-out forwards",
        "fade-in": "fade-in 0.3s ease-out",
      },
      keyframes: {
        "emoji-float": {
          "0%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(-100px) scale(1.5)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
