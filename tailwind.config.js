/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        brand: {
          50: '#eef4ff', 100: '#dae6ff', 200: '#bcd2ff', 300: '#8eb4ff', 400: '#598bff',
          500: '#3563f6', 600: '#1f45eb', 700: '#1834d8', 800: '#1a2daf', 900: '#1b2c8a', 950: '#151d54',
        },
      },
    },
  },
  plugins: [],
};
