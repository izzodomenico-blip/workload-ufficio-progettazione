// PM2 — modalità PRODUZIONE.
// Avvia due app: il server (build + API) e il watchdog salute.
// Sotto un servizio Windows vero (vedi install-service.ps1) via:
//   pm2-runtime start ecosystem.config.cjs
// Non serve `pm2 save`/`pm2 resurrect`: questo file è l'unica fonte dei processi.
const path = require('node:path')
const stateDir = process.env.WORKLOAD_STATE_DIR ? path.resolve(process.env.WORKLOAD_STATE_DIR) : __dirname

module.exports = {
  apps: [
    {
      name: "workload-ufficio-progettazione",
      script: "server/index.js",
      cwd: __dirname,
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOST: "0.0.0.0",
      },
      autorestart: true,
      watch: false,
      exp_backoff_restart_delay: 200,
      max_memory_restart: "400M",
      kill_timeout: 5000,
      out_file: path.join(stateDir, "logs", "server-out.log"),
      error_file: path.join(stateDir, "logs", "server-err.log"),
    },
    {
      name: "workload-watchdog",
      script: "server/watchdog.js",
      cwd: __dirname,
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        APP_NAME: "workload-ufficio-progettazione",
      },
      autorestart: true,
      watch: false,
      exp_backoff_restart_delay: 200,
      max_memory_restart: "150M",
      out_file: path.join(stateDir, "logs", "watchdog-out.log"),
      error_file: path.join(stateDir, "logs", "watchdog-err.log"),
    },
  ],
};
