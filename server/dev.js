import { spawn } from 'node:child_process'
import process from 'node:process'

const isWindows = process.platform === 'win32'
const children = []

function run(label, command, args, env = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: isWindows,
    env: { ...process.env, ...env },
  })
  children.push(child)
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${label} terminato con codice ${code}`)
      shutdown(code)
    }
  })
}

run('backend', 'node', ['server/index.js'], {
  NODE_ENV: 'development',
  PORT: process.env.PORT || '3000',
  HOST: process.env.HOST || '0.0.0.0',
})

run('frontend', 'npm', ['run', 'dev:frontend'])

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
