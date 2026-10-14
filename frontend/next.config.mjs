/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a verification build go to its own folder (NEXT_DIST_DIR=.next-build npm run build)
  // without overwriting the .next folder a running `npm run dev` is using.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
};

export default nextConfig;
