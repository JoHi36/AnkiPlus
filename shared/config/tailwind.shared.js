/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        'anki-bg': '#1A1A1A',
        'anki-surface': 'rgba(255,255,255,0.03)',
        'anki-surface-elevated': '#222224',
        'anki-border': 'rgba(255,255,255,0.06)',
        'anki-border-medium': 'rgba(255,255,255,0.12)',
        'anki-accent': '#0a84ff',
        'anki-teal': {
          400: '#2dd4bf',
          500: '#14b8a6',
          900: '#134e4a',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      spacing: {
        'section': '2.5rem',
        'section-md': '5rem',
      },
    },
  },
};


