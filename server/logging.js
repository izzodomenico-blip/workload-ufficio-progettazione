import fs from 'node:fs'
import path from 'node:path'

export function appendLine(filePath, line) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const text = line.endsWith('\n') ? line : `${line}\n`
  fs.appendFileSync(filePath, text)
}

export function rotateIfNeeded(filePath, maxLines) {
  if (!fs.existsSync(filePath)) return
  const raw = fs.readFileSync(filePath, 'utf8')
  const parts = raw.split('\n')
  const lines = parts.length > 0 && parts[parts.length - 1] === '' ? parts.slice(0, -1) : parts
  if (lines.length <= maxLines) return
  const kept = lines.slice(lines.length - maxLines)
  fs.writeFileSync(filePath, `${kept.join('\n')}\n`)
}
