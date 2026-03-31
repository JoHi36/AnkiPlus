import sharedPreset from '../shared/config/tailwind.preset.js';

export default {
  presets: [sharedPreset],
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './index.html',
  ],
};
