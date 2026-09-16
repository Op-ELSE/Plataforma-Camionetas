$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:8080/")
$listener.Start()
Write-Host "Server started at http://127.0.0.1:8080/"
while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response
        $path = $req.Url.LocalPath
        if ($path -eq "/") { $path = "/index.html" }
        
        $localPath = Join-Path "c:\Users\PEGEGAR\Downloads\Camionetas - Taller" $path.Substring(1)
        if (Test-Path $localPath) {
            $fileInfo = New-Object System.IO.FileInfo($localPath)
            $res.ContentLength64 = $fileInfo.Length
            if ($localPath.EndsWith(".html")) { $res.ContentType = "text/html; charset=utf-8" }
            elseif ($localPath.EndsWith(".js")) { $res.ContentType = "application/javascript; charset=utf-8" }
            elseif ($localPath.EndsWith(".css")) { $res.ContentType = "text/css; charset=utf-8" }
            elseif ($localPath.EndsWith(".glb")) { $res.ContentType = "model/gltf-binary" }
            elseif ($localPath.EndsWith(".png")) { $res.ContentType = "image/png" }
            
            $fileStream = [System.IO.File]::OpenRead($localPath)
            try {
                $fileStream.CopyTo($res.OutputStream)
            } finally {
                $fileStream.Close()
            }
        } else {
            $res.StatusCode = 404
        }
        $res.Close()
    } catch {
        Write-Host "Error: $_"
    }
}
