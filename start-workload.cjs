const { spawn } = require("child_process");

const child = spawn(
  "cmd.exe",
  ["/d", "/s", "/c", "npm run dev -- --host 0.0.0.0 --port 5173"],
  {
    cwd: __dirname,
    stdio: "pipe",
    shell: false,
    windowsHide: true,
  }
);

child.stdout.on("data", (data) => {
  process.stdout.write(data);
});

child.stderr.on("data", (data) => {
  process.stderr.write(data);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  console.error("Errore avvio workload:", err);
  process.exit(1);
});