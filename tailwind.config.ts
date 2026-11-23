import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fbf7ff', 100: '#f2e6ff', 200: '#e1caff', 300: '#ceadff', 400: '#bf85ff',
          500: '#a955db', 600: '#8733b5', 700: '#6d278f', 800: '#4c1c68', 900: '#321344',
        },
        cream: { 50: '#fffdf8', 100: '#f3e1c7', 200: '#e6d0aa', 300: '#c0a171' },
        berry: { 50: '#fff1f1', 100: '#ffe0e0', 500: '#da2f2e', 700: '#92171b' },
        leaf: { 100: '#edf4e5', 500: '#7fab51', 700: '#50814c' },
      },
      minHeight: { touch: '3rem' }, // objetivo táctil mínimoSSSssssadas
    },
  },
  plugins: [],
};
export default config;
