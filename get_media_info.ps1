[void][System.Reflection.Assembly]::LoadWithPartialName('System.Runtime.WindowsRuntime')

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { 
    $_.Name -eq 'AsTask' -and 
    $_.GetParameters().Count -eq 1 -and 
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' 
})[0]

function Await($WinRtTask, $ResultType) {
    try {
        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
        $netTask = $asTask.Invoke($null, @($WinRtTask))
        $netTask.Wait(-1) | Out-Null
        return $netTask.Result
    } catch {
        return $null
    }
}

try {
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime] | Out-Null
    $managerAsync = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    $manager = Await $managerAsync ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    if ($manager) {
        $session = $manager.GetCurrentSession()
        if ($session) {
            $sourceApp = $session.SourceAppId
            $propsAsync = $session.TryGetMediaPropertiesAsync()
            $properties = Await $propsAsync ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionProperties])
            if ($properties) {
                $output = @{
                    title = $properties.Title
                    artist = $properties.Artist
                    album = $properties.AlbumTitle
                    app = $sourceApp
                }
                Write-Output ($output | ConvertTo-Json -Compress)
                exit 0
            }
        }
    }
} catch {
    # Fail silently and output empty JSON
}

Write-Output "{}"
exit 0
