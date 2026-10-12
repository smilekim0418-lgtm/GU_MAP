# WinRT OCR — 단어 상자와 함께 TextAngle(기울기) 를 내보낸다. 상자는 기울기를 편 좌표계 기준이다.
# 사용법: powershell -ExecutionPolicy Bypass -File ocr_win.ps1 -ImagePath <png> -Lang ko
param(
  [Parameter(Mandatory = $true)][string]$ImagePath,
  [string]$Lang = "ko"
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($operation, $type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  $task.Wait(-1) | Out-Null
  $task.Result
}

$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]

$language = [Windows.Globalization.Language]::new($Lang)
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
if ($null -eq $engine) { throw "OCR 엔진을 만들 수 없음: $Lang" }

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try {
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

  $words = New-Object System.Collections.ArrayList
  foreach ($line in $result.Lines) {
    foreach ($word in $line.Words) {
      $null = $words.Add([pscustomobject]@{
        text = $word.Text
        x    = [math]::Round($word.BoundingRect.X, 2)
        y    = [math]::Round($word.BoundingRect.Y, 2)
        w    = [math]::Round($word.BoundingRect.Width, 2)
        h    = [math]::Round($word.BoundingRect.Height, 2)
      })
    }
  }
  ConvertTo-Json -InputObject ([pscustomobject]@{ angle = $result.TextAngle; width = $bitmap.PixelWidth; height = $bitmap.PixelHeight; words = @($words) }) -Depth 4 -Compress
}
finally {
  $stream.Dispose()
}
