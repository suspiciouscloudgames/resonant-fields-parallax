param([string]$InstallRoot="$env:USERPROFILE\Exhibition",[string]$PreviousData='')
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$source=$PSScriptRoot
$version=(Get-Content -LiteralPath (Join-Path $source 'version.json') -Raw | ConvertFrom-Json).version
if($version -notmatch '^v[0-9A-Za-z._-]{1,90}$'){throw 'Invalid release version'}
$null=New-Item -ItemType Directory -Force -Path $InstallRoot
$records=Join-Path $InstallRoot 'runtime-data'
$null=New-Item -ItemType Directory -Force -Path $records
if(!(Test-Path (Join-Path $InstallRoot 'runtime\pythonw.exe'))){
    Copy-Item -LiteralPath (Join-Path $source 'runtime') -Destination $InstallRoot -Recurse
}
$python=Join-Path $InstallRoot 'runtime\python.exe'
$pythonw=Join-Path $InstallRoot 'runtime\pythonw.exe'
$active=Join-Path $InstallRoot 'active.json'
if(!(Test-Path $active)){
    $release=Join-Path $InstallRoot "releases\$version"
    $null=New-Item -ItemType Directory -Force -Path $release
    Get-ChildItem -LiteralPath $source | Where-Object {$_.Name -notin @('runtime','runtime-data','private','output')} | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $release -Recurse -Force
    }
    if($PreviousData -and (Test-Path -LiteralPath $PreviousData)){
        $previousKey=Join-Path $PreviousData 'pairing-key'
        if(Test-Path -LiteralPath $previousKey){Copy-Item -LiteralPath $previousKey -Destination $records}
        elseif(Test-Path -LiteralPath (Join-Path $PreviousData 'exhibition.log')){
            $stream=[IO.File]::Open((Join-Path $PreviousData 'exhibition.log'),[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
            $reader=New-Object IO.StreamReader($stream)
            try{$previousLog=$reader.ReadToEnd()}finally{$reader.Dispose()}
            $matchesFound=[regex]::Matches($previousLog,'Phone connection: http://[^\s;]+[?&]key=([a-f0-9]{12,64})')
            if($matchesFound.Count){[IO.File]::WriteAllText((Join-Path $records 'pairing-key'),$matchesFound[$matchesFound.Count-1].Groups[1].Value,[Text.Encoding]::ASCII)}
        }
        $database=Join-Path $PreviousData 'messages.sqlite3'
        if(Test-Path -LiteralPath $database){
            & $python -c 'import sqlite3,sys; a=sqlite3.connect(sys.argv[1]); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()' $database (Join-Path $records 'messages.sqlite3')
            if($LASTEXITCODE){throw 'Could not migrate exhibition messages'}
        }
    }
    @{version=$version} | ConvertTo-Json -Compress | Set-Content -LiteralPath $active -Encoding ASCII
}
Copy-Item -LiteralPath (Join-Path $source 'exhibition-manager.py') -Destination $InstallRoot -Force
$manager=Join-Path $InstallRoot 'exhibition-manager.py'
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$action=New-ScheduledTaskAction -Execute $pythonw -Argument ('"'+$manager+'" run') -WorkingDirectory $InstallRoot
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $user
$trigger.Delay='PT10S'
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$null=Register-ScheduledTask -TaskName 'ResonantFields-Exhibition' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force

$shell=New-Object -ComObject WScript.Shell
$desktop=[Environment]::GetFolderPath('Desktop')
foreach($entry in @(@('Exhibition-START','start'),@('Exhibition-OFF','shutdown'))){
    $link=$shell.CreateShortcut((Join-Path $desktop ($entry[0]+'.lnk')))
    $link.TargetPath=$pythonw;$link.Arguments='"'+$manager+'" '+$entry[1]
    $link.WorkingDirectory=$InstallRoot;$link.Description='Resonant Fields exhibition';$link.Save()
}
if(!(Get-NetFirewallRule -DisplayName 'ResonantFields-Mobile-HTTP' -ErrorAction SilentlyContinue)){
    $null=New-NetFirewallRule -DisplayName 'ResonantFields-Mobile-HTTP' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8770 -RemoteAddress 'LocalSubnet','100.64.0.0/10' -Profile Any
}
if(!(Get-NetFirewallRule -DisplayName 'ResonantFields-Mobile-Discovery' -ErrorAction SilentlyContinue)){
    $null=New-NetFirewallRule -DisplayName 'ResonantFields-Mobile-Discovery' -Direction Inbound -Action Allow -Protocol UDP -LocalPort 8771 -RemoteAddress LocalSubnet -Profile Any
}
# Short power-button press performs a normal Windows shutdown.
& powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS PBUTTONACTION 3
if($LASTEXITCODE){throw 'Could not set AC power button action'}
& powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS PBUTTONACTION 3
if($LASTEXITCODE){throw 'Could not set battery power button action'}
& powercfg /setactive SCHEME_CURRENT
Write-Output ('INSTALLED '+$version+' AT '+$InstallRoot)
