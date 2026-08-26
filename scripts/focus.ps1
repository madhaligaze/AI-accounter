# Выводит окно процесса на передний план. Нужно, чтобы нативные диалоги
# NCALayer получали клавиатурный ввод и попадали в скриншот экрана.
param([Parameter(Mandatory=$true)][string]$TitleLike)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
$p = Get-Process | Where-Object { $_.MainWindowTitle -like "*$TitleLike*" } | Select-Object -First 1
if ($null -eq $p) { Write-Output "NOT FOUND: $TitleLike"; exit 1 }
[Win]::ShowWindow($p.MainWindowHandle, 9) | Out-Null   # SW_RESTORE
[Win]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
Write-Output ("FOCUSED: {0} [{1}] {2}" -f $p.ProcessName, $p.Id, $p.MainWindowTitle)
