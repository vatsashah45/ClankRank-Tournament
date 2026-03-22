/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@agent-madness/shared"],
  webpack: (config) => {
    // Allow .js imports to resolve to .ts files (ESM compatibility)
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

module.exports = nextConfig;
