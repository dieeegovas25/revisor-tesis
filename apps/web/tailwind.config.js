/** @type {import('tailwindcss').Config} */
module.exports = {
  // ¡Esta sección es vital para que Tailwind escanee tus componentes!
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        // Tu paleta de colores personalizada
        primary: {
          50: '#f0fdf4',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        accent: {
          500: '#f59e0b',
        }
      }
    }
  },
  plugins: [],
}