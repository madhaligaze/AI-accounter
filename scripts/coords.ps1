# Диагностика координат: сравнивает то, что отдаёт UI Automation, с реальным
# положением окна по Win32 и с размером экрана. Нужен, чтобы поймать
# расхождение из-за масштабирования дисплея.
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left, Top, Right, Bottom; }
public class W32 {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
}
'@ -ErrorAction SilentlyContinue

Write-Output ("До SetProcessDPIAware: экран = {0}x{1}" -f [W32]::GetSystemMetrics(0), [W32]::GetSystemMetrics(1))
[W32]::SetProcessDPIAware() | Out-Null
Write-Output ("После SetProcessDPIAware: экран = {0}x{1}" -f [W32]::GetSystemMetrics(0), [W32]::GetSystemMetrics(1))

$AE = [System.Windows.Automation.AutomationElement]
$Tree = [System.Windows.Automation.TreeScope]
$cond = New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, "NCALayer")
$win = $AE::RootElement.FindFirst($Tree::Children, $cond)
if ($null -eq $win) { Write-Output "окно NCALayer не найдено"; exit 1 }

$h = [IntPtr]$win.Current.NativeWindowHandle
$r = New-Object RECT
[W32]::GetWindowRect($h, [ref]$r) | Out-Null
Write-Output ("Окно по Win32:  {0},{1} .. {2},{3}" -f $r.Left, $r.Top, $r.Right, $r.Bottom)

$wr = $win.Current.BoundingRectangle
Write-Output ("Окно по UIA:    {0},{1} размер {2}x{3}" -f [int]$wr.X, [int]$wr.Y, [int]$wr.Width, [int]$wr.Height)

foreach ($e in $win.FindAll($Tree::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    if ($e.Current.ControlType.ProgrammaticName -eq "ControlType.Button") {
        $b = $e.Current.BoundingRectangle
        Write-Output ("Кнопка '{0}': {1},{2} {3}x{4} -> центр {5},{6}" -f `
            $e.Current.Name, [int]$b.X, [int]$b.Y, [int]$b.Width, [int]$b.Height, `
            [int]($b.X + $b.Width/2), [int]($b.Y + $b.Height/2))
    }
}
Write-Output ("Курсор сейчас: " + [System.Windows.Forms.Cursor]::Position)
