import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { seeded } from "../utils";
import type { GeneratedImage, ImageProvider, ImageRequest } from "./imageProvider";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Encodes a simple two-colour diagonal gradient PNG with no dependencies. */
export function gradientPng(width: number, height: number, from: [number, number, number], to: [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      const i = row + 1 + x * 3;
      raw[i] = Math.round(from[0] + (to[0] - from[0]) * t);
      raw[i + 1] = Math.round(from[1] + (to[1] - from[1]) * t);
      raw[i + 2] = Math.round(from[2] + (to[2] - from[2]) * t);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PALETTES: [number, number, number][][] = [
  [[34, 87, 122], [56, 163, 165]],
  [[87, 64, 140], [200, 120, 160]],
  [[40, 110, 70], [180, 200, 110]],
  [[150, 70, 50], [235, 170, 90]],
  [[30, 40, 70], [90, 120, 190]],
];

/** Used when no image API is configured. Produces a PNG (uploadable) plus an SVG preview with the title. */
export class PlaceholderImageProvider implements ImageProvider {
  readonly name = "placeholder";

  async generate(req: ImageRequest): Promise<GeneratedImage> {
    fs.mkdirSync(path.dirname(req.outPathBase), { recursive: true });
    const [from, to] = PALETTES[Math.floor(seeded(req.title) * PALETTES.length)];
    const png = `${req.outPathBase}.png`;
    fs.writeFileSync(png, gradientPng(req.width, req.height, from, to));
    const esc = req.title.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    fs.writeFileSync(
      `${req.outPathBase}.svg`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${req.width}" height="${req.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgb(${from})"/><stop offset="1" stop-color="rgb(${to})"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="50%" fill="#fff" font-size="44" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">${esc}</text></svg>`,
    );
    return { path: png, mimeType: "image/png", provider: this.name, isPlaceholder: true };
  }
}
