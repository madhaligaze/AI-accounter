# Снимок всего экрана — нужен, чтобы видеть нативные окна NCALayer,
# которые Playwright не видит (это не часть страницы).
param([string]$Out = "")
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
if ([string]::IsNullOrEmpty($Out)) {
    $dir = Join-Path $PSScriptRoot "..\shots"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $Out = Join-Path $dir ("screen-" + [DateTime]::Now.ToString("HHmmss") + ".png")
}
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output $Out

# Заодно перечисляем видимые окна — так проще понять, что за диалог открылся.
Get-Process | Where-Object { $_.MainWindowTitle -ne "" } |
    Select-Object Id, ProcessName, MainWindowTitle | Format-Table -AutoSize | Out-String
