# Перечисляет элементы окна через UI Automation.
# NCALayer построен на JavaFX, который отдаёт нативное дерево доступности,
# поэтому диалогом можно управлять адресно, а не кликами по координатам.
param([string]$TitleLike = "NCALayer")

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty, $TitleLike)
$win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)

if ($null -eq $win) { Write-Output "WINDOW NOT FOUND: $TitleLike"; exit 1 }
Write-Output ("WINDOW: " + $win.Current.Name)

$all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition)
Write-Output ("DESCENDANTS: " + $all.Count)

foreach ($e in $all) {
    $c = $e.Current
    # У части элементов JavaFX отдаёт бесконечные размеры — приведение к int
    # на них падает, поэтому печатаем координаты отдельно и безопасно.
    $rect = "?"
    try {
        $r = $c.BoundingRectangle
        if (-not [double]::IsInfinity($r.Width) -and -not [double]::IsInfinity($r.X)) {
            $rect = ("{0},{1} {2}x{3}" -f [int]$r.X, [int]$r.Y, [int]$r.Width, [int]$r.Height)
        }
    } catch { }
    Write-Output ("[{0}] name='{1}' id='{2}' enabled={3} rect={4}" -f `
        $c.ControlType.ProgrammaticName, $c.Name, $c.AutomationId, $c.IsEnabled, $rect)
}
