import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only (production never double-invokes). React Strict Mode mounts,
  // unmounts and remounts every effect; @react-three/fiber's unmount calls
  // forceContextLoss() on the <canvas> the remount then reuses, so in dev
  // every WebGL scene on the invitation rendered as a dead canvas. Off, so
  // what the owner sees in `npm run dev` is what ships.
  reactStrictMode: false,
  images: {
    // Every quality the invitation asks for. Next 16 refuses unlisted ones.
    qualities: [65, 70, 75, 78, 80],
  },
};

export default nextConfig;
