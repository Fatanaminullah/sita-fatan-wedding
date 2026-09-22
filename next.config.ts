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
    qualities: [75, 85, 90],
    // 1280 and 1600 are the gallery's texture sizes (see gallery.tsx). A
    // width that is in neither list is refused, and the tunnel would come up
    // black rather than merely large.
    deviceSizes: [640, 750, 828, 1080, 1200, 1280, 1600, 1920, 2048, 3840],
  },
};

export default nextConfig;
