import type { Config } from "@react-router/dev/config"
import { vercelPreset } from "@vercel/react-router/vite"

export default {
  ssr: true,
  // @vercel/react-router still declares a peer on react-router 7; it works
  // under 8 but only load it where it matters (Vercel builds) so local dev
  // and CI never depend on it.
  presets: process.env.VERCEL ? [vercelPreset()] : [],
} satisfies Config
