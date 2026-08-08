$ErrorActionPreference = "Continue"
$posts = @(
    "https://www.anhpng.com/2023/03/anh-png-trong-ong-11.html",
    "https://www.anhpng.com/2023/03/anh-png-trong-ong-10.html",
    "https://www.anhpng.com/2023/03/anh-png-trong-ong-09.html",
    "https://www.anhpng.com/2023/03/anh-png-trong-ong-08.html",
    "https://www.anhpng.com/2023/03/anh-png-trong-ong-vector-07.html",
    "https://www.anhpng.com/2023/03/anh-png-trong-ong-ong-son-vector-06.html",
    "https://www.anhpng.com/2023/03/anh-png-trong-ong-vector-05.html",
    "https://www.anhpng.com/2023/03/anh-png-trong-ong-ong-son-vector-04.html",
    "https://www.anhpng.com/2023/03/anh-png-hoa-tiet-trong-ong-03.html",
    "https://www.anhpng.com/2023/03/anh-png-trong-ong-ong-son-02.html",
    "https://www.anhpng.com/2023/03/anh-png-trong-ong-01.html"
)
$dir = "D:\Bamso\downloads\trong_dong"
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
foreach ($p in $posts) {
    try {
        $r = Invoke-WebRequest -Uri $p -UserAgent $ua -UseBasicParsing
        $m = [regex]::Match($r.Content, '<meta[^>]+property=[''"]og:image[''"][^>]+content=[''"]([^''"]+)[''"]')
        if (-not $m.Success) {
            $m = [regex]::Match($r.Content, '<meta[^>]+content=[''"]([^''"]+)[''"][^>]+property=[''"]og:image[''"]')
        }
        if ($m.Success) {
            $imgUrl = $m.Groups[1].Value
            $num = [regex]::Match($p, '-(\d+)\.html$').Groups[1].Value
            $out = Join-Path $dir ("TRONG_DONG_" + $num + ".png")
            Invoke-WebRequest -Uri $imgUrl -OutFile $out -UserAgent $ua -UseBasicParsing
            $size = (Get-Item $out).Length
            Write-Output ("OK  " + $num + "  " + $size + " bytes  " + $out)
        } else {
            Write-Output ("NO-IMAGE  " + $p)
        }
    } catch {
        Write-Output ("FAIL  " + $p + "  " + $_.Exception.Message)
    }
}
