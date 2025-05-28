module.exports = {
  apps: [
    {
      name: "vista-backend",
      script: "app.js",
      cwd: "./",
      env: {
        NODE_ENV: "production",
        PORT: 3030,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      error_file: "./logs/backend-error.log",
      out_file: "./logs/backend-out.log",
      log_file: "./logs/backend-combined.log",
      time: true,
    },
    {
      name: "vista-proxy",
      script: "server.js",
      cwd: "./",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      error_file: "./logs/proxy-error.log",
      out_file: "./logs/proxy-out.log",
      log_file: "./logs/proxy-combined.log",
      time: true,
    },
  ],
};
