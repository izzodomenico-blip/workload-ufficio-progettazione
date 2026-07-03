// PM2 — modalità PRODUZIONE.
// Avvia il server Node che serve la BUILD (dist/) + le API su un'unica porta.
// Prerequisito: aver eseguito `npm ci` e `npm run build` almeno una volta.
//
//   pm2 start ecosystem.config.cjs
//   pm2 save
//
// NB: NON usa `npm run dev` (quella è la modalità sviluppo con Vite, non adatta
// a restare sempre online).
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
      restart_delay: 5000,
      max_restarts: 30,
    },
  ],
};
