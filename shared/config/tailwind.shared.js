/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        'anki-bg': '#030303',
        'anki-surface': '#0A0A0A',
        'anki-surface-elevated': '#111',
        'anki-teal': {
          400: '#2dd4bf',
          500: '#14b8a6',
          900: '#134e4a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      spacing: {
        'section': '2.5rem',
        'section-md': '5rem',
      },
    },
  },
};


