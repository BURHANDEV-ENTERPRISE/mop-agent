/** @type {import('next').NextConfig} */
const nextConfig = {
  // The shared protocol package ships raw TS — let Next transpile it.
  transpilePackages: ["@mop/link-protocol"],
  // Native modules must not be bundled — require them at runtime instead.
  serverExternalPackages: ["better-sqlite3", "sqlite-vec", "@xenova/transformers", "onnxruntime-node"],
};

export default nextConfig;
