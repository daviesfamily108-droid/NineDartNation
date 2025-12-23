import QRCode from "qrcode";

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

export type QrLogoOptions = {
  logoUrl: string;
  // Fraction of the QR's min(width,height) for the logo box. 0.18-0.24 is typical.
  logoScale?: number;
  // Add a white rounded mask under the logo to preserve scan contrast
  mask?: boolean;
  // Outline color for the mask box
  maskStroke?: string;
  // Corner radius for mask box
  radiusPx?: number;
  // Shape of the logo area: 'circle' | 'rounded-rect' | 'rect'
  shape?: "circle" | "rounded-rect" | "rect";
};

export async function composeQrWithLogo(
  qrDataUrl: string,
  opts: QrLogoOptions,
): Promise<string> {
  const [qrImg, logoImg] = await Promise.all([
    loadImage(qrDataUrl),
    loadImage(opts.logoUrl),
  ]);
  const w = Math.max(160, qrImg.width || 160);
  const h = Math.max(160, qrImg.height || 160);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  // Draw QR without smoothing to keep it crisp
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrImg, 0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.max(0.14, Math.min(0.28, opts.logoScale ?? 0.2));
  const logoSize = Math.round(Math.min(w, h) * scale);
  const x = Math.round(cx - logoSize / 2);
  const y = Math.round(cy - logoSize / 2);

  if (opts.mask !== false) {
    const shape = opts.shape || "rounded-rect";
    const pad = Math.max(2, Math.round(logoSize * 0.08));
    const bx = x - pad;
    const by = y - pad;
    const bw = logoSize + pad * 2;
    const bh = logoSize + pad * 2;
    ctx.beginPath();
    if (shape === "circle") {
      const r = Math.min(bw, bh) / 2;
      ctx.arc(bx + bw / 2, by + bh / 2, r, 0, Math.PI * 2);
    } else if (shape === "rect") {
      ctx.rect(bx, by, bw, bh);
    } else {
      const radius = Math.max(4, opts.radiusPx ?? Math.round(logoSize * 0.12));
      const r = Math.min(radius, bw / 2, bh / 2);
      ctx.moveTo(bx + r, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
      ctx.arcTo(bx, by + bh, bx, by, r);
      ctx.arcTo(bx, by, bx + bw, by, r);
      ctx.closePath();
    }
    // Fill white mask
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    // Optional subtle stroke to separate from modules
    ctx.lineWidth = 1;
    ctx.strokeStyle = opts.maskStroke || "rgba(0,0,0,0.12)";
    ctx.stroke();
  }

  // Draw the logo centered (clip to shape if circle desired)
  ctx.save();
  if (opts.shape === "circle") {
    const r = logoSize / 2;
    ctx.beginPath();
    ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(logoImg, x, y, logoSize, logoSize);
  ctx.restore();
  return canvas.toDataURL("image/png");
}

export type MakeQrOptions = {
  width?: number;
  margin?: number;
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  color?: { dark?: string; light?: string };
  logo?: QrLogoOptions | false;
};

export async function makeQrDataUrlWithLogo(
  text: string,
  options: MakeQrOptions,
): Promise<string> {
  const {
    width = 256,
    margin = 2,
    errorCorrectionLevel = "H",
    color = { dark: "#000000", light: "#ffffff" },
    logo,
  } = options || {};
  const base = await QRCode.toDataURL(text, {
    width,
    margin,
    errorCorrectionLevel,
    color,
  });
  if (!logo) return base;
  return composeQrWithLogo(base, logo);
}
