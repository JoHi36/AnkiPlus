/** @type {import('tailwindcss').Config} */
import preset from '../shared/config/tailwind.preset.js';

export default {
  presets: [preset],
  content: [
    "./template.html",
    "./interactions.js",
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
  plugins: [require('daisyui')],
  daisyui: {
    themes: [{
      dark: {
        "base-100": "var(--ds-bg-canvas)",
        "base-200": "var(--ds-bg-deep)",
        "base-300": "var(--ds-bg-overlay)",
        "base-content": "var(--ds-text-primary)",
        "primary": "var(--ds-accent)",
        "primary-content": "white",
        "secondary": "var(--ds-purple)",
        "accent": "var(--ds-accent)",
        "neutral": "var(--ds-bg-overlay)",
        "neutral-content": "var(--ds-text-secondary)",
        "info": "var(--ds-accent)",
        "success": "var(--ds-green)",
        "warning": "var(--ds-yellow)",
        "error": "var(--ds-red)",
      },
    }],
    darkTheme: "dark",
    base: true,
    styled: true,
    utils: true,
    logs: false,
  },
};
