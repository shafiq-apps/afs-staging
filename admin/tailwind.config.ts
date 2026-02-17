import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        glowDrift1: {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(80px,60px) scale(1.1)" },
        },
        glowDrift2: {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(-70px,-50px) scale(1.08)" },
        },
        glowDrift3: {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(60px,-80px) scale(1.12)" },
        },
      },
      animation: {
        "glow-drift-1": "glowDrift1 18s ease-in-out infinite",
        "glow-drift-2": "glowDrift2 22s ease-in-out infinite",
        "glow-drift-3": "glowDrift3 26s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;