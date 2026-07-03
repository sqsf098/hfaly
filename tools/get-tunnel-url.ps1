# Повертає https-адресу Cloudflare quick tunnel (порожньо, якщо ще не готовий)
try {
  $resp = Invoke-WebRequest -Uri 'http://localhost:33445/quicktunnel' -UseBasicParsing -TimeoutSec 3
  $h = (ConvertFrom-Json $resp.Content).hostname
  if ($h) { Write-Output ("https://" + $h) }
} catch {}
