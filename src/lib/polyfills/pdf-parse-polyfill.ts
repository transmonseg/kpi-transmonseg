// Polyfills pra pdf-parse@2.4.5 rodar em Node serverless.
// pdfjs-dist referencia DOMMatrix/Path2D/ImageData no top-level e quebra
// com "ReferenceError" na Vercel. Stubs vazios bastam pra extração de texto.

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any

if (typeof g.DOMMatrix === 'undefined') {
  g.DOMMatrix = class { constructor(_?: unknown) {} }
}
if (typeof g.Path2D === 'undefined') {
  g.Path2D = class { constructor(_?: unknown) {} }
}
if (typeof g.ImageData === 'undefined') {
  g.ImageData = class { constructor(_a?: unknown, _b?: unknown, _c?: unknown) {} }
}

export {}
