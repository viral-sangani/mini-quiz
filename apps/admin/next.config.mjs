/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mini-quiz/shared"],
  async redirects() {
    return [
      // /users was the old admin user list; renamed to /players in the redesign.
      { source: "/users", destination: "/players", permanent: false },
    ];
  },
};

export default nextConfig;
