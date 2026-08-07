module.exports = {
  apps: [
    {
      name: "garden-backend",
      script: "./server/index.js",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 5000
      }
    },
    {
      name: "garden-frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      watch: false,
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_BACKEND_URL: "https://api.conkudaden.online"
      }
    }
  ]
};
