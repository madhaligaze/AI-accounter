# Закрывает висящий диалог NCALayer (кнопка «Отмена»).
# Нужен, чтобы сбросить состояние перед чистым прогоном сценария.
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

$AE = [System.Windows.Automation.AutomationElement]
$Tree = [System.Windows.Automation.TreeScope]
$cond = New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, "NCALayer")
$win = $AE::RootElement.FindFirst($Tree::Children, $cond)
if ($null -eq $win) { Write-Output "нет открытого диалога"; exit 0 }

$all = $win.FindAll($Tree::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
foreach ($e in $all) {
    if ($e.Current.ControlType.ProgrammaticName -eq "ControlType.Button" -and $e.Current.Name -eq "Отмена") {
        try {
            $e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
            Write-Output "диалог отменён"
        } catch { Write-Output "не удалось нажать «Отмена»: $_" }
        exit 0
    }
}
Write-Output "кнопка «Отмена» не найдена"
