// Genera las dos capas de la marca de agua y las guarda como base64 en lib/marca-agua.ts.
// Se corre a mano (npm run marca-agua) solo si cambia el diseño: en producción (Vercel) no hay
// fuentes del sistema para dibujar texto, por eso las imágenes quedan versionadas en el repo.
//
// 1. Mosaico: trama fina de líneas diagonales cruzadas (clara y oscura, para que se vea en cualquier
//    fondo) + el texto en diagonal dos veces por baldosa. Cubre toda la foto con un patrón de alta
//    frecuencia: borrarlo con IA deja la imagen visiblemente dañada.
// 2. Sello: "MUESTRA" grande, que se pone en el centro de cada foto.
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const TEXTO = 'MUESTRA · FOTOS EXPRESS';
const LADO = 480; // baldosa cuadrada: la trama a 45° empalma sin cortes si LADO es múltiplo de PASO
const PASO = 24;

const lineas = [];
for (let k = -LADO; k <= 2 * LADO; k += PASO) {
  // Diagonales "\" y "/" que cruzan toda la baldosa.
  lineas.push(`M${k},0 L${k + LADO},${LADO}`, `M${k},${LADO} L${k + LADO},0`);
}
const trama = lineas.join(' ');

const texto = (cx, cy) => `
  <g transform="rotate(-28 ${cx} ${cy})" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="28"
     text-anchor="middle" letter-spacing="1">
    <text x="${cx}" y="${cy + 10}" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="4">${TEXTO}</text>
    <text x="${cx}" y="${cy + 10}" fill="rgba(255,255,255,0.62)">${TEXTO}</text>
  </g>`;

const mosaico = `<svg xmlns="http://www.w3.org/2000/svg" width="${LADO}" height="${LADO}">
  <path d="${trama}" stroke="rgba(0,0,0,0.14)" stroke-width="1.6" transform="translate(1,1)"/>
  <path d="${trama}" stroke="rgba(255,255,255,0.22)" stroke-width="1.2"/>
  ${texto(LADO / 2, LADO / 4)}
  ${texto(LADO / 2, (3 * LADO) / 4)}
</svg>`;

const sello = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="260">
  <text x="500" y="200" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="190"
        letter-spacing="12" fill="rgba(255,255,255,0.38)" stroke="rgba(0,0,0,0.30)" stroke-width="5">MUESTRA</text>
</svg>`;

const png = (svg) => sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();
const [pngMosaico, pngSello] = await Promise.all([png(mosaico), png(sello)]);

await writeFile(
  new URL('../lib/marca-agua.ts', import.meta.url),
  `// Generado por scripts/generar-marca-agua.mjs. No editar a mano.\n` +
    `export const MOSAICO_PNG_BASE64 =\n  '${pngMosaico.toString('base64')}';\n\n` +
    `export const SELLO_PNG_BASE64 =\n  '${pngSello.toString('base64')}';\n`,
);
console.log(`Mosaico ${LADO}x${LADO}: ${pngMosaico.length} bytes · Sello 1000x260: ${pngSello.length} bytes`);
