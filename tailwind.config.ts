import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  "#f0efff",
          100: "#e3e1ff",
          200: "#cbc8ff",
          300: "#ada9ff",
          400: "#8d83ff",
          500: "#7165ff",
          600: "#534AB7",
          700: "#4239A0",
          800: "#362e85",
          900: "#2d266e",
          950: "#1a1540",
        },
      },
    },
  },
  plugins: [],
};

export default config;
