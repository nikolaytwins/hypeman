/** PM2 на Selectel: путь к релизу после rsync из GitHub Actions */
const root = "/mnt/data/hypeman/current";

module.exports = {
  apps: [
    {
      name: "hypeman",
      cwd: root,
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: "3006",
        HOSTNAME: "127.0.0.1",
        FFMPEG_PATH: "/usr/bin/ffmpeg",
        FFPROBE_PATH: "/usr/bin/ffprobe",
      },
    },
  ],
};
