export function recordResult(history, healthy, threshold) {
  const next = [...history, !!healthy]
  return next.length > threshold ? next.slice(next.length - threshold) : next
}

export function shouldRestart(history, threshold) {
  if (history.length < threshold) return false
  return history.slice(history.length - threshold).every((h) => h === false)
}
