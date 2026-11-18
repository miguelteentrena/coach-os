import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0a0b0a', 900: '#101211', 850: '#151816', 800: '#1b1f1c', 700: '#262b27', 600: '#363d38', 500: '#5b645d', 400: '#8a938c', 300: '#b7bfb9', 100: '#eef2ee' },
        lime: { DEFAULT: '#c6f432', soft: '#c6f43222', dim: '#8fb320' },
        sig: { red: '#ff5d5d', yellow: '#ffc94d', green: '#c6f432' },
      },
      fontFamily: { sans: ['var(--font-sans)', 'system-ui', 'sans-serif'], mono: ['var(--font-mono)', 'ui-monospace', 'monospace'] },
    },
  },
} satisfies Config;
