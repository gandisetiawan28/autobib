$folder = 'C:\AutoBib_Addin';
if (!(Test-Path $folder)) { New-Item -ItemType Directory -Force -Path $folder | Out-Null; };
Copy-Item -Path 'D:\Gandi PC\autobib-master\autobib-master\manifest.xml' -Destination "$folder\manifest.xml" -Force;
try { New-SmbShare -Name 'AutoBib_Addin' -Path $folder -FullAccess 'Everyone' -ErrorAction SilentlyContinue | Out-Null; } catch {};
$regPath = 'HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\{-AutoBib-Catalog-}';
New-Item -Path $regPath -Force -ErrorAction SilentlyContinue | Out-Null;
Set-ItemProperty -Path $regPath -Name 'Id' -Value '{-AutoBib-Catalog-}';
Set-ItemProperty -Path $regPath -Name 'Url' -Value '\\localhost\AutoBib_Addin';
Set-ItemProperty -Path $regPath -Name 'Flags' -Value 1;
