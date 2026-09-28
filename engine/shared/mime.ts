/** mime.ts — le type de contenu d'un fichier servi, d'après son extension. */
const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", css: "text/css", js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8", txt: "text/plain; charset=utf-8",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon", avif: "image/avif",
  woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf",
  mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
}

export function mimeDe(chemin: string): string {
  return MIME[chemin.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? ""] ?? "application/octet-stream"
}
