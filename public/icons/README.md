# PWA icons

This folder contains the PWA icons referenced by `public/manifest.webmanifest`.

This folder contains the PWA icons referenced by `public/manifest.webmanifest`.

We include simple SVG placeholder icons (`icon-192.svg` and `icon-512.svg`) that
provide an immediate improvement over a plain white tile for add-to-home/splash
screens. For the best results on Android and iOS, export raster PNGs at the
recommended sizes (192×192 and 512×512) and update `manifest.webmanifest` to
point to those PNG files. Example export commands using ImageMagick:

```powershell
# from the project root, generate PNGs from the 512 SVG (Windows PowerShell)
magick convert public/icons/icon-512.svg -resize 512x512 public/icon-512.png
magick convert public/icons/icon-512.svg -resize 192x192 public/icon-192.png
```

If you export PNGs, also consider adding a `purpose: "maskable"` icon for
launcher masks on some Android launchers.
