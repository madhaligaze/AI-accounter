# Проходит нативный диалог NCALayer: подставляет путь к ключу, вводит пароль
# и нажимает «Открыть». Диалог на JavaFX и полностью доступен через UI Automation,
# поэтому работаем по именам элементов, а не по координатам.
#
# ВАЖНО: файл должен быть сохранён в UTF-8 с BOM — иначе PowerShell 5.1
# прочитает кириллические имена элементов как мусор и ничего не найдёт.
param(
    [string]$Password = $env:ECP_PASSWORD,
    [string]$KeyPath  = $env:ECP_KEY_PATH,
    [int]$TimeoutSec  = 30
)

if ([string]::IsNullOrEmpty($Password)) { Write-Output "ERR: пароль не задан"; exit 1 }

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms, System.Drawing

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class NativeWin {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
    [DllImport("user32.dll")] public static extern short GetKeyState(int k);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

    // SendKeys учитывает Caps Lock: при включённом пароль уходит с инвертированным
    // регистром, и NCALayer отвечает «Неверный пароль». Поэтому на время ввода
    // Caps Lock выключаем, а потом возвращаем как было.
    public static bool CapsOn() { return (GetKeyState(0x14) & 1) == 1; }
    public static void ToggleCaps() {
        keybd_event(0x14, 0x45, 1, UIntPtr.Zero);       // KEYEVENTF_EXTENDEDKEY
        keybd_event(0x14, 0x45, 1 | 2, UIntPtr.Zero);   // ... | KEYEVENTF_KEYUP
    }

    // Windows не даёт фоновому процессу просто так забрать фокус.
    // Штатный обход — временно присоединиться к очереди ввода активного окна.
    public static bool ForceForeground(IntPtr h) {
        ShowWindow(h, 9);            // SW_RESTORE — диалог мог быть свёрнут
        uint me = GetCurrentThreadId();
        uint other = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
        AttachThreadInput(me, other, true);
        BringWindowToTop(h);
        bool ok = SetForegroundWindow(h);
        AttachThreadInput(me, other, false);
        return ok;
    }
}
'@ -ErrorAction SilentlyContinue

# Тонкость с масштабированием дисплея. NCALayer отдаёт координаты САМОГО окна
# в физических пикселях, а координаты своих JavaFX-элементов — в логических.
# Поэтому позицию элемента перед кликом надо домножать на коэффициент
# масштаба, иначе курсор уезжает мимо окна (при 150% — на треть экрана).
$logicalW = [NativeWin]::GetSystemMetrics(0)
[NativeWin]::SetProcessDPIAware() | Out-Null
$physicalW = [NativeWin]::GetSystemMetrics(0)
$script:DpiScale = if ($logicalW -gt 0) { [double]$physicalW / [double]$logicalW } else { 1.0 }
Write-Output ("OK: масштаб дисплея = {0}" -f $script:DpiScale)

$AE   = [System.Windows.Automation.AutomationElement]
$Tree = [System.Windows.Automation.TreeScope]
$TrueC = [System.Windows.Automation.Condition]::TrueCondition

function Get-NcaWindow {
    $cond = New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, "NCALayer")
    return $AE::RootElement.FindFirst($Tree::Children, $cond)
}

function Find-Child($win, $type, $name) {
    $all = $win.FindAll($Tree::Descendants, $TrueC)
    foreach ($e in $all) {
        if ($e.Current.ControlType.ProgrammaticName -eq "ControlType.$type" -and $e.Current.Name -eq $name) {
            return $e
        }
    }
    return $null
}

# JavaFX-список не реагирует на SelectionItemPattern/SetFocus, поэтому
# выделение делаем настоящим кликом мыши по центру элемента.
function Click-Element($el) {
    $r = $el.Current.BoundingRectangle
    if ([double]::IsInfinity($r.X) -or $r.Width -le 0) { return $false }
    $x = [int](($r.X + $r.Width / 2) * $script:DpiScale)
    $y = [int](($r.Y + $r.Height / 2) * $script:DpiScale)
    [NativeWin]::SetCursorPos($x, $y) | Out-Null
    Start-Sleep -Milliseconds 250
    [NativeWin]::mouse_event(0x02, 0, 0, 0, 0)   # ЛКМ вниз
    Start-Sleep -Milliseconds 80
    [NativeWin]::mouse_event(0x04, 0, 0, 0, 0)   # ЛКМ вверх
    Start-Sleep -Milliseconds 250
    return $true
}

function Send-Literal([string]$text) {
    foreach ($ch in $text.ToCharArray()) {
        $s = [string]$ch
        if ("+^%~(){}[]".Contains($s)) { $s = "{$s}" }
        [System.Windows.Forms.SendKeys]::SendWait($s)
        Start-Sleep -Milliseconds 35
    }
}

# 1. Дожидаемся диалога — он появляется асинхронно после запроса сайта.
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$win = $null
do {
    $win = Get-NcaWindow
    if ($null -ne $win) { break }
    Start-Sleep -Milliseconds 400
} while ((Get-Date) -lt $deadline)

if ($null -eq $win) { Write-Output "ERR: окно NCALayer не появилось за $TimeoutSec сек"; exit 1 }
Write-Output "OK: окно найдено"

# Диалог должен быть активным, иначе ввод с клавиатуры уйдёт не туда
# (в прошлой версии он улетал в редактор). Проверяем результат явно.
$hwnd = [IntPtr]$win.Current.NativeWindowHandle
$focused = $false
for ($i = 0; $i -lt 10; $i++) {
    [NativeWin]::ForceForeground($hwnd) | Out-Null
    Start-Sleep -Milliseconds 350
    if ([NativeWin]::GetForegroundWindow() -eq $hwnd) { $focused = $true; break }
}
if (-not $focused) { Write-Output "ERR: не удалось активировать окно NCALayer"; exit 1 }
Write-Output "OK: окно активно"
# После восстановления окна дерево UIA пересоздаётся — перечитываем его.
Start-Sleep -Milliseconds 400
$win = Get-NcaWindow

# Диалог может уже стоять на экране выбора ключа (например, после прерванной
# попытки) — тогда шаги с путём и паролем не нужны.
$alreadyAtCertScreen = ($null -ne (Find-Child $win "Button" "Подписать"))
if ($alreadyAtCertScreen) { Write-Output "OK: диалог уже на экране выбора ключа" }

# 2. Путь к ключу. NCALayer помнит последний, но полагаться на это нельзя.
if (-not $alreadyAtCertScreen -and -not [string]::IsNullOrEmpty($KeyPath)) {
    $pathEdit = Find-Child $win "Edit" "Место хранения"
    if ($null -ne $pathEdit) {
        # JavaFX не отдаёт ValuePattern у этого поля, но показывает текущее
        # значение дочерним Text-элементом — читаем оттуда.
        $cur = ""
        $kids = $pathEdit.FindAll($Tree::Descendants, $TrueC)
        foreach ($k in $kids) {
            if ($k.Current.ControlType.ProgrammaticName -eq "ControlType.Text") { $cur = $k.Current.Name; break }
        }
        if ($cur -eq $KeyPath) {
            Write-Output "OK: путь уже верный"
        } else {
            # SendKeys не умеет кириллицу (шлёт VK текущей раскладки), а путь
            # к ключу обычно содержит кириллицу — вставляем через буфер обмена.
            $pathEdit.SetFocus()
            Start-Sleep -Milliseconds 250
            Set-Clipboard -Value $KeyPath
            [System.Windows.Forms.SendKeys]::SendWait("^a")
            [System.Windows.Forms.SendKeys]::SendWait("^v")
            Start-Sleep -Milliseconds 300
            Write-Output "OK: путь вставлен из буфера (было: '$cur')"
        }
    }
}

if (-not $alreadyAtCertScreen) {
    # 3. Пароль. Поля пароля не отдают ValuePattern — вводим с клавиатуры.
    $pwdEl = Find-Child $win "Edit" "Пароль"
    if ($null -eq $pwdEl) { Write-Output "ERR: поле пароля не найдено"; exit 1 }

    # Страховка: пароль не должен уйти в чужое окно, если фокус успел уплыть.
    if ([NativeWin]::GetForegroundWindow() -ne $hwnd) {
        [NativeWin]::ForceForeground($hwnd) | Out-Null
        Start-Sleep -Milliseconds 400
        if ([NativeWin]::GetForegroundWindow() -ne $hwnd) {
            Write-Output "ERR: фокус не на NCALayer — ввод пароля отменён"; exit 1
        }
    }
    $pwdEl.SetFocus()
    Start-Sleep -Milliseconds 300
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    [System.Windows.Forms.SendKeys]::SendWait("{DEL}")
    $capsWasOn = [NativeWin]::CapsOn()
    if ($capsWasOn) { [NativeWin]::ToggleCaps(); Start-Sleep -Milliseconds 200; Write-Output "OK: Caps Lock выключен на время ввода" }
    Send-Literal $Password
    if ($capsWasOn) { [NativeWin]::ToggleCaps(); Start-Sleep -Milliseconds 200 }
    Write-Output "OK: пароль введён"
    Start-Sleep -Milliseconds 700

    # 4. «Открыть» активируется только после валидного ввода — это наша проверка.
    $open = Find-Child $win "Button" "Открыть"
    if ($null -eq $open) { Write-Output "ERR: кнопка «Открыть» не найдена"; exit 1 }
    if (-not $open.Current.IsEnabled) { Write-Output "ERR: кнопка «Открыть» неактивна — ввод не принят"; exit 1 }

    $invoked = $false
    try {
        $open.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        $invoked = $true
    } catch { }
    if (-not $invoked) { Click-Element $open | Out-Null }
    Write-Output "OK: нажата «Открыть»"
}

# 5. Второй экран — «Выберите ключ»: список сертификатов из хранилища.
#    Окно то же самое, но содержимое полностью заменяется, поэтому ждём
#    появления кнопки «Подписать», а не нового окна.
$deadline2 = (Get-Date).AddSeconds(20)
$sign = $null
do {
    Start-Sleep -Milliseconds 400
    $win2 = Get-NcaWindow
    if ($null -eq $win2) { continue }
    $sign = Find-Child $win2 "Button" "Подписать"
} while ($null -eq $sign -and (Get-Date) -lt $deadline2)

if ($null -eq $sign) {
    # Экрана выбора не было — значит подпись уже ушла на сайт.
    Write-Output "OK: экран выбора ключа не появился (подпись отправлена)"
    exit 0
}

# Выбираем сертификат. Если задан CertOwner — ищем по владельцу,
# иначе берём первый: в личном хранилище ключ обычно один.
$items = @()
$all2 = $win2.FindAll($Tree::Descendants, $TrueC)
foreach ($e in $all2) {
    if ($e.Current.ControlType.ProgrammaticName -eq "ControlType.ListItem") { $items += $e }
}
if ($items.Count -eq 0) { Write-Output "ERR: список сертификатов пуст"; exit 1 }
Write-Output ("OK: сертификатов в списке: " + $items.Count)

$pick = $items[0]
if (-not [string]::IsNullOrEmpty($env:ECP_CERT_OWNER)) {
    foreach ($it in $items) {
        if ($it.Current.Name -like "*$($env:ECP_CERT_OWNER)*") { $pick = $it; break }
    }
}
Write-Output ("OK: выбран -> " + $pick.Current.Name)

# Окно должно быть активным, иначе клик мыши уйдёт в другое приложение.
$hwnd2 = [IntPtr]$win2.Current.NativeWindowHandle
for ($i = 0; $i -lt 8; $i++) {
    if ([NativeWin]::GetForegroundWindow() -eq $hwnd2) { break }
    [NativeWin]::ForceForeground($hwnd2) | Out-Null
    Start-Sleep -Milliseconds 300
}
# Клик по JavaFX иногда не регистрируется, если окно в этот момент теряет
# фокус. Поэтому повторяем цикл «фокус -> выделить -> подписать» и каждый раз
# проверяем, закрылся ли экран.
$gone = $false
for ($attempt = 1; $attempt -le 5 -and -not $gone; $attempt++) {
    $w = Get-NcaWindow
    if ($null -eq $w) { $gone = $true; break }
    $signBtn = Find-Child $w "Button" "Подписать"
    if ($null -eq $signBtn) { $gone = $true; break }

    $h = [IntPtr]$w.Current.NativeWindowHandle
    for ($i = 0; $i -lt 8; $i++) {
        if ([NativeWin]::GetForegroundWindow() -eq $h) { break }
        [NativeWin]::ForceForeground($h) | Out-Null
        Start-Sleep -Milliseconds 300
    }

    $items = @()
    foreach ($e in $w.FindAll($Tree::Descendants, $TrueC)) {
        if ($e.Current.ControlType.ProgrammaticName -eq "ControlType.ListItem") { $items += $e }
    }
    $target = $items[0]
    if (-not [string]::IsNullOrEmpty($env:ECP_CERT_OWNER)) {
        foreach ($it in $items) { if ($it.Current.Name -like "*$($env:ECP_CERT_OWNER)*") { $target = $it; break } }
    }
    if ($null -ne $target) { Click-Element $target | Out-Null }
    Start-Sleep -Milliseconds 400
    Click-Element $signBtn | Out-Null
    Write-Output "OK: попытка $attempt — нажата «Подписать»"

    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Milliseconds 400
        $w2 = Get-NcaWindow
        if ($null -eq $w2 -or $null -eq (Find-Child $w2 "Button" "Подписать")) { $gone = $true; break }
    }
}

if ($gone) { Write-Output "OK: подпись отправлена сайту" }
else { Write-Output "ERR: экран выбора ключа не закрылся"; exit 1 }
