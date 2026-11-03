// Genera el mosaico de la marca de agua y lo guarda como base64 en lib/marca-agua.ts.
// Se corre a mano (npm run marca-agua) solo si cambia el diseño: en producción (Vercel) no hay
// fuentes del sistema para dibujar texto, por eso la imagen queda versionada en el repo.
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const TEXTO = 'FOTOS EXPRESS · MUESTRA';
const ANCHO = 560;
const ALTO = 300;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}">
  <g transform="rotate(-28 ${ANCHO / 2} ${ALTO / 2})" font-family="DejaVu Sans, sans-serif" font-weight="700"
     font-size="30" text-anchor="middle" letter-spacing="2">
    <text x="${ANCHO / 2}" y="${ALTO / 2 + 11}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="4">${TEXTO}</text>
    <text x="${ANCHO / 2}" y="${ALTO / 2 + 11}" fill="rgba(255,255,255,0.55)">${TEXTO}</text>
  </g>
</svg>`;

const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();

await writeFile(
  new URL('../lib/marca-agua.ts', import.meta.url),
  `// Generado por scripts/generar-marca-agua.mjs. No editar a mano.\n` +
    `export const MARCA_AGUA_PNG_BASE64 =\n  '${png.toString('base64')}';\n`,
);
console.log(`Marca de agua: ${ANCHO}x${ALTO}, ${png.length} bytes`);
