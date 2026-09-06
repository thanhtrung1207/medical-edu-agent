import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        primary: {
          DEFAULT: "#8B1E3F",
          50: "#FBF7F2",
          100: "#F5DDE4",
          200: "#E8B5C4",
          300: "#D4849A",
          400: "#B83A5C",
          500: "#8B1E3F",
          600: "#7A1838",
          700: "#5C0F28",
          800: "#4A0C20",
          900: "#3A0919",
        },
        secondary: {
          DEFAULT: "#C9A961",
          50: "#FBF8EE",
          100: "#F4E9CE",
          200: "#E9D49E",
          300: "#DEBF6E",
          400: "#D4B455",
          500: "#C9A961",
          600: "#B89248",
          700: "#A88A44",
          800: "#8A7038",
          900: "#6F5A2E",
        },
        cream: "#FBF7F2",
        surface: "#FFFFFF",
        surface2: "#FDF8F3",
        borderSoft: "#F0E8DE",
      },
      keyframes: {
        "bounce-dot": {
          "0%, 80%, 100%": { transform: "scale(0)", opacity: "0.5" },
          "40%": { transform: "scale(1)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "bounce-dot": "bounce-dot 1.4s infinite ease-in-out both",
        "fade-in": "fade-in 0.25s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
