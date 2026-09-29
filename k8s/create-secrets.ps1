# Creates/updates the "<service>-secrets" Kubernetes Secrets from each app's .env file.
# Only the keys listed below are copied (least privilege) — ports and RABBITMQ_URI
# come from the Helm chart instead. Safe to re-run; existing Secrets are updated.
#
# Usage (from the repo root, with kubectl pointed at the target cluster):
#   powershell -ExecutionPolicy Bypass -File k8s/create-secrets.ps1

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

$secretKeys = [ordered]@{
  auth          = @('MONGODB_URI', 'JWT_SECRET', 'JWT_EXPIRES_IN')
  reservations  = @('MONGODB_URI')
  payments      = @('MONGODB_URI', 'PAYSTACK_SECRETKEY', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD', 'REDIS_TLS')
  notifications = @('SMTP_USER', 'BREVO_API_KEY')
}

foreach ($service in $secretKeys.Keys) {
  $envFile = Join-Path $repoRoot "apps/$service/.env"
  if (-not (Test-Path $envFile)) { throw "Missing $envFile" }

  # Parse KEY=VALUE lines the way dotenv does: trim whitespace, strip surrounding quotes
  $values = @{}
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $key, $value = $line -split '=', 2
    $value = $value.Trim()
    if ($value -match '^([''"])(.*)\1$') { $value = $Matches[2] }
    $values[$key.Trim()] = $value
  }

  $lines = @()
  foreach ($key in $secretKeys[$service]) {
    if ($values.ContainsKey($key)) { $lines += "$key=$($values[$key])" }
    else { Write-Warning "$service`: $key not found in .env, skipping" }
  }

  # Temp file (UTF-8 without BOM — a BOM would corrupt the first key), deleted right after
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllLines($tmp, $lines, (New-Object System.Text.UTF8Encoding($false)))
    kubectl create secret generic "$service-secrets" --from-env-file=$tmp --dry-run=client -o yaml | kubectl apply -f -
    if ($LASTEXITCODE -ne 0) { throw "Failed to apply $service-secrets" }
  }
  finally {
    Remove-Item $tmp -Force
  }
}
