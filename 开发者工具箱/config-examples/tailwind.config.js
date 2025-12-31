/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'extension-primary': '#3b82f6',
        'extension-secondary': '#8b5cf6',
      },
    },
  },
  plugins: [],
}

