#Requires -RunAsAdministrator
# Registra (idempotente) un task pianificato giornaliero che copia i backup sul NAS.
# Gira a nome di un UTENTE con accesso al NAS (LocalSystem di norma non vede le share).
# Le credenziali sono chieste a runtime e affidate a Windows: NON finiscono nel repo.
param(
  [Parameter(Mandatory = $true)][string]$Dest,          # es. \\NAS\backup\flowrlink
  [string]$Time = '20:00',
  [string]$TaskName = 'Flowrlink Backup NAS'
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$script = Join-Path $PSScriptRoot 'backup-data.ps1'
if (-not (Test-Path $script)) { throw "backup-data.ps1 non trovato in $PSScriptRoot" }

$cred = Get-Credential -Message "Utente con accesso al NAS $Dest (es. DOMINIO\utente)"
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Dest `"$Dest`""
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Limited -Force | Out-Null

Write-Host "Task '$TaskName' registrato: ogni giorno alle $Time copia i backup su $Dest."
Write-Host "Esecuzione di prova adesso:"
Start-ScheduledTask -TaskName $TaskName
