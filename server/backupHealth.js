const RANK = { ok: 0, warn: 1, error: 2 }

export function computeBackupHealth({ latestVerified, offsiteReceipt, now = Date.now(), maxAgeMs = 26 * 3600000 }) {
  const reasons = []
  let status = 'ok'
  const escalate = (s, reason) => {
    if (RANK[s] > RANK[status]) status = s
    reasons.push(reason)
  }

  if (!latestVerified) {
    escalate('error', 'Nessuno snapshot verificato presente.')
  } else {
    if (latestVerified.integrityOk === false) escalate('error', 'Ultimo snapshot: verifica integrità FALLITA.')
    const age = now - new Date(latestVerified.createdAt).getTime()
    if (!(age < maxAgeMs)) escalate('warn', 'Ultimo snapshot verificato troppo vecchio.')
  }

  if (!offsiteReceipt) {
    escalate('warn', 'Nessuna copia sul NAS ancora registrata.')
  } else {
    if (offsiteReceipt.lastOffsiteOk === false) escalate('warn', 'Ultima copia sul NAS FALLITA.')
    const oage = now - new Date(offsiteReceipt.lastOffsiteAt).getTime()
    if (!(oage < maxAgeMs)) escalate('warn', 'Copia sul NAS troppo vecchia.')
  }

  return { status, reasons, details: { latestVerified: latestVerified ?? null, offsiteReceipt: offsiteReceipt ?? null } }
}
