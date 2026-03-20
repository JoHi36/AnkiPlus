/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        'deep':       'var(--ds-bg-deep)',
        'canvas':     'var(--ds-bg-canvas)',
        'frosted':    'var(--ds-bg-frosted)',
        'overlay':    'var(--ds-bg-overlay)',
        'accent':     'var(--ds-accent)',
        'success':    'var(--ds-green)',
        'warning':    'var(--ds-yellow)',
        'error':      'var(--ds-red)',
        'purple':     'var(--ds-purple)',
      },
      textColor: {
        'primary':    'var(--ds-text-primary)',
        'secondary':  'var(--ds-text-secondary)',
        'tertiary':   'var(--ds-text-tertiary)',
        'muted':      'var(--ds-text-muted)',
      },
      borderColor: {
        'subtle':     'var(--ds-border-subtle)',
        'medium':     'var(--ds-border-medium)',
      },
      fontFamily: {
        'sans':  'var(--ds-font-sans)',
        'brand': 'var(--ds-font-brand)',
        'mono':  'var(--ds-font-mono)',
      },
      borderRadius: {
        'sm': 'var(--ds-radius-sm)',
        'md': 'var(--ds-radius-md)',
        'lg': 'var(--ds-radius-lg)',
        'xl': 'var(--ds-radius-xl)',
      },
      fontSize: {
        'xs':   'var(--ds-text-xs)',
        'sm':   'var(--ds-text-sm)',
        'base': 'var(--ds-text-base)',
        'md':   'var(--ds-text-md)',
        'lg':   'var(--ds-text-lg)',
        'xl':   'var(--ds-text-xl)',
        '2xl':  'var(--ds-text-2xl)',
      },
    },
  },
};
