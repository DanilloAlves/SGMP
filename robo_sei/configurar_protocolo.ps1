$pythonExe = (Get-Command python).Source
$scriptPath = Join-Path $PSScriptRoot "robo_sei.py"

Write-Host "Python encontrado em: $pythonExe"
Write-Host "Script do robo em: $scriptPath"

$regPath = "HKCU:\Software\Classes\sgmp-sei"
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "(default)" -Value "URL:Protocolo SGMP SEI"
Set-ItemProperty -Path $regPath -Name "URL Protocol" -Value ""

$cmdPath = "HKCU:\Software\Classes\sgmp-sei\shell\open\command"
New-Item -Path $cmdPath -Force | Out-Null
$commandValue = "`"$pythonExe`" `"$scriptPath`" `"%1`""
Set-ItemProperty -Path $cmdPath -Name "(default)" -Value $commandValue

Write-Host "Protocolo sgmp-sei:// registrado com sucesso no Windows!" -ForegroundColor Green
