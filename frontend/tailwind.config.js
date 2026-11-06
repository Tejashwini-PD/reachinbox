/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefbf4',
          100: '#d6f5e3',
          200: '#b0eacb',
          300: '#7bd9ab',
          400: '#41c184',
          500: '#1ba56a',
          600: '#0f8655',
          700: '#0d6b47',
          800: '#0d553a',
          900: '#0b4631',
        },
        canvas: '#f7f7f4',
        ink: '#1c1d1a',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(28, 29, 26, 0.04), 0 8px 24px rgba(28, 29, 26, 0.04)',
        pop: '0 18px 50px rgba(28, 29, 26, 0.14)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(18px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 180ms ease-out both',
        'slide-in': 'slide-in 220ms ease-out both',
      },
    },
  },
  plugins: [],
};
