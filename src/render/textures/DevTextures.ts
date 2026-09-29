import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/** Measured grid texture for greybox/test geometry (1 texture tile = 1 m). */
export function gridTexture(base = '#6f7480', line = '#565b66', accent = '#8a90a0', size = 256): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = line;
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * size;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, size);
    g.moveTo(0, p);
    g.lineTo(size, p);
    g.stroke();
  }
  g.strokeStyle = accent;
  g.lineWidth = 4;
  g.strokeRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
