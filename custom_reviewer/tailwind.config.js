/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/custom_reviewer/template.html",
    "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/custom_reviewer/interactions.js",
    "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/custom_screens.py",
  ],
  safelist: [
    // Dynamic classes used in JS for evaluation results & MC
    'text-error', 'text-warning', 'text-success', 'text-primary',
    'text-error-content', 'text-success-content',
    'btn-success', 'btn-error', 'btn-ghost',
    'badge-success', 'badge-error', 'badge-ghost', 'badge-sm',
    'opacity-40', 'opacity-100', 'scale-75', 'scale-100',
    'line-through', 'hidden',
  ],
  theme: {
    extend: {
      colors: {
        'bg-dark': '#1A1A1A',
        'bg-panel': '#1A1A1A',
        'bg-inset': '#151515',
        'bg-muted': '#252525',
        'text-primary': '#e8e8e8',
        'text-hint': '#9a9a9a',
        'accent': '#0a84ff',
        'rate-again': '#ff453a',
        'rate-hard': '#ffd60a',
        'rate-good': '#30d158',
        'rate-easy': '#0a84ff',
        'stat-new': 'rgba(10, 132, 255, 0.85)',
        'stat-learning': 'rgba(255, 159, 10, 0.85)',
        'stat-review': 'rgba(48, 209, 88, 0.85)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        'xl': '22px',
        'lg': '18px',
        'md': '12px',
        'sm': '8px',
      },
    },
  },
  plugins: [require('/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend/node_modules/daisyui')],
  daisyui: {
    themes: [
      {
        dark: {
          "base-100": "#1A1A1A",
          "base-200": "#151515",
          "base-300": "#222224",
          "base-content": "#e8e8e8",
          "primary": "#0a84ff",
          "primary-content": "#ffffff",
          "secondary": "#40a0ff",
          "accent": "#0071e3",
          "neutral": "#2C2C2E",
          "neutral-content": "#9a9a9a",
          "info": "#4a9eff",
          "success": "#30d158",
          "warning": "#ffd60a",
          "error": "#ff453a",
        },
      },
    ],
    darkTheme: "dark",
    base: true,
    styled: true,
    utils: true,
    logs: false,
  },
};
