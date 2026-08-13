/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const LOGO_FILES = [
  { name: 'logo.png', mime: 'image/png' },
  { name: 'logo.svg', mime: 'image/svg+xml' },
]

/**
 * Ersetzt die Verweise auf die Logodateien durch eingebettete Daten. Danach
 * braucht die index.html keine Nachbardateien mehr und ist für sich allein
 * lauffähig – zum Weitergeben genügt diese eine Datei.
 */
function embedLogos(html: string, publicDir: string): string {
  let result = html
  for (const { name, mime } of LOGO_FILES) {
    let data: string
    try {
      data = readFileSync(resolve(publicDir, name)).toString('base64')
    } catch {
      continue // Datei nicht vorhanden – Verweis unverändert lassen
    }
    const uri = `data:${mime};base64,${data}`
    result = result.split(`./${name}`).join(uri)
  }
  return result
}

/**
 * Bettet JavaScript und CSS direkt in die index.html ein.
 *
 * Hintergrund: Wird eine gebaute Seite per Doppelklick geöffnet (file://),
 * blockiert der Browser das Nachladen von Modul-Skripten und Stylesheets aus
 * Sicherheitsgründen (CORS) – die Seite bliebe weiß. Ist alles inline, gibt es
 * nichts nachzuladen und die Datei läuft ohne Server.
 */
function inlineAssets(): Plugin {
  let publicDir = 'public'

  return {
    name: 'turnierverwaltung-inline-assets',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir
    },
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find(
        (item) => item.type === 'asset' && item.fileName.endsWith('.html'),
      )
      if (!html || html.type !== 'asset') return

      let source = String(html.source)

      for (const [fileName, item] of Object.entries(bundle)) {
        // Wichtig: die Ersetzung als Funktion übergeben. Bei einer Zeichenkette
        // würde $&, $` oder $' im minifizierten Code als Sonderzeichen gedeutet
        // und Teile des Dokuments würden vervielfacht eingefügt.
        if (fileName.endsWith('.js') && item.type === 'chunk') {
          // "</script>" in Zeichenketten würde das umschließende Tag vorzeitig
          // beenden – der maskierte Schrägstrich verhindert das.
          const code = item.code.replace(/<\/script/gi, '<\\/script')
          source = source.replace(
            new RegExp(`<script[^>]*src="[^"]*${escapeRegExp(fileName)}"[^>]*></script>`),
            () => `<script type="module">\n${code}\n</script>`,
          )
          delete bundle[fileName]
        }

        if (fileName.endsWith('.css') && item.type === 'asset') {
          const css = String(item.source)
          source = source.replace(
            new RegExp(`<link[^>]*href="[^"]*${escapeRegExp(fileName)}"[^>]*>`),
            () => `<style>\n${css}\n</style>`,
          )
          delete bundle[fileName]
        }
      }

      html.source = embedLogos(source, publicDir)
    },
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// https://vite.dev/config/
export default defineConfig({
  // Relative Pfade, damit die gebaute Seite auch aus einem beliebigen Ordner
  // heraus per Doppelklick funktioniert.
  base: './',
  plugins: [react(), inlineAssets()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
