module.exports = {
  apps: [
    {
      name: "workload-ufficio-progettazione",
      script: "C:\\Windows\\System32\\cmd.exe",
      args: "/c npm run dev -- --host 0.0.0.0 --port 5173",
      cwd: "C:\\Users\\domenicoizzoj\\Documents\\workload-ufficio-progettazione",
      interpreter: "none",
      autorestart: true,
      watch: false,
      restart_delay: 5000
    }
  ]
};