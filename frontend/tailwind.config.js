import preset from '../shared/config/tailwind.preset.js';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../shared/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 3s ease-in-out infinite',
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        dark: {
          "color-scheme": "dark",
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
      },
      {
        light: {
          "color-scheme": "light",
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
      },
    ],
    darkTheme: "dark",
    base: true,
    styled: true,
    utils: true,
    logs: false,
  },
};
