# Release script for Hermes Desktop
# Usage: powershell -ExecutionPolicy Bypass -File _release.ps1 <version>
# Example: powershell -ExecutionPolicy Bypass -File _release.ps1 0.21.2

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

# Get GitHub token from git credential helper
$cred = echo "url=https://github.com" | git credential fill 2>$null
$token = ($cred | Select-String "password=").ToString().Replace("password=","")
if (-not $token) {
    Write-Error "Could not get GitHub token from git credential helper"
    exit 1
}

$headers = @{
    Authorization = "Bearer $token"
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

$TagName = "v$Version"
$ReleaseDir = "C:\Users\kotas\hermes\hermes-agent\apps\desktop\release"

# Check required files exist
$requiredFiles = @(
    "$ReleaseDir\Hermes-$Version-win-x64.exe",
    "$ReleaseDir\Hermes-$Version-win-x64.exe.blockmap",
    "$ReleaseDir\latest.yml"
)

foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        Write-Error "Required file not found: $file`nRun 'npm run dist:win:nsis' first."
        exit 1
    }
}

# Create release
Write-Output "Creating release $TagName..."
$bodyJson = @{
    tag_name = $TagName
    target_commitish = "main"
    name = "Hermes $TagName"
    body = "See commit history for details."
    draft = $false
    prerelease = $false
} | ConvertTo-Json -Depth 5 -Compress

$resp = Invoke-RestMethod -Uri "https://api.github.com/repos/S1d11/hermes-agent/releases" -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($bodyJson)) -ContentType "application/json; charset=utf-8"
$releaseId = $resp.id
Write-Output "Release created: $($resp.html_url)"

# Upload all assets
$assets = @(
    @{ path = "$ReleaseDir\Hermes-$Version-win-x64.exe"; name = "Hermes-$Version-win-x64.exe"; contentType = "application/octet-stream" },
    @{ path = "$ReleaseDir\Hermes-$Version-win-x64.exe.blockmap"; name = "Hermes-$Version-win-x64.exe.blockmap"; contentType = "application/octet-stream" },
    @{ path = "$ReleaseDir\latest.yml"; name = "latest.yml"; contentType = "application/octet-stream" }
)

foreach ($asset in $assets) {
    $fileName = $asset.name
    $filePath = $asset.path
    $contentType = $asset.contentType

    Write-Output "Uploading $fileName..."
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    Write-Output "  Size: $($bytes.Length) bytes"

    $uploadUrl = "https://uploads.github.com/repos/S1d11/hermes-agent/releases/$releaseId/assets?name=$([System.Uri]::EscapeDataString($fileName))"

    $uploadHeaders = @{
        Authorization = "Bearer $token"
        Accept = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
        "Content-Type" = $contentType
    }

    $resp2 = Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers $uploadHeaders -Body $bytes -ContentType $contentType
    Write-Output "  Uploaded: $($resp2.browser_download_url)"
}

Write-Output "Done! Release $TagName published with all assets."
