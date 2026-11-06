/** @type {import('next').NextConfig} */
// No ESLint setup in this project; type-checking still runs on every build.
const nextConfig = { reactStrictMode: true, eslint: { ignoreDuringBuilds: true } };
export default nextConfig;
