# Use the name of the current dir as the filename
$basename = Get-Location | Split-Path -Leaf
$zipname = "$basename.zip"
$xpiname = "$basename.xpi"

# Find the dir containing manifest.json
$srcdir = Get-ChildItem -Recurse -Filter manifest.json -File | Split-Path | Resolve-Path -Relative

if (Test-Path -Path $zipname) {
    Remove-Item -Path $zipname   
}
# Zip everythin from that dir and below
Compress-Archive -Path "$srcdir\*" -DestinationPath $zipname

# Rename the zip
if (Test-Path -Path $xpiname) {
    Remove-Item -Path $xpiname
}
Rename-Item -Path $zipname -NewName $xpiname

# TODO Add error handling