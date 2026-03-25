# Lance le proxy Pennylane (PowerShell). Dashboard: ouvrir solidarite-textile.html ou frip-and-co.html via serveur statique.
$env:PORT = if ($env:PORT) { $env:PORT } else { "8765" }
$env:CORS_ALLOW_ORIGIN = if ($env:CORS_ALLOW_ORIGIN) { $env:CORS_ALLOW_ORIGIN } else { "*" }
Set-Location $PSScriptRoot
python -m flask --app pennylane_proxy run --host 0.0.0.0 --port $env:PORT
