/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0B0D13',
          card: '#131620',
          elevated: '#1A1E2D',
          border: 'rgba(255, 255, 255, 0.07)',
          hover: '#22283A',
        },
        brand: {
          indigo: '#6366F1',
          primary: '#5046E5',
          light: '#818CF8',
        },
        pro: {
          gold: '#F59E0B',
          amber: '#D97706',
          yellow: '#FBBF24',
        },
        status: {
          emerald: '#10B981',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'glow-indigo': '0 0 25px -5px rgba(99, 102, 241, 0.3)',
        'glow-gold': '0 0 25px -5px rgba(245, 158, 11, 0.3)',
        'glow-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.3)',
      }
    },
  },
  plugins: [],
}
