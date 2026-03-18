/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "primary": "#1349ec",
        "background-light": "#f6f6f8",
        "background-dark": "#101522",
      },
      fontFamily: {
        "display": ["Inter"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px",
      },
    },
  },
  darkMode: "class",
  plugins: [],
}
