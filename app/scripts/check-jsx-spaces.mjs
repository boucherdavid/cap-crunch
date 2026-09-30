// Détecte les espaces que le compilateur SWC (Next.js) supprime à tort dans le JSX.
//
// Bogue constaté le 2026-09-30 : un texte JSX qui contient une entité HTML (&apos;, &quot;,
// &amp;...) ET un saut de ligne perd l'espace qui le sépare de l'élément précédent
// ({expression} ou <balise>). Ex : `{n > 1 ? 'ont' : 'a'} une protection (fin d&apos;ELC) —⏎`
// s'affiche « ontune protection ». Correctif : `{' '}` explicite avant le texte.
//
// Usage (depuis app/) : npm run check:jsx-spaces  → code de sortie 1 si un cas est trouvé
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOTS = ['app', 'components']
const files = []
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (p.endsWith('.tsx')) files.push(p)
  }
}
ROOTS.filter((r) => fs.existsSync(r)).forEach(walk)

const fix = process.argv.includes('--fix')
let count = 0
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const hits = []
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const text = node.getFullText()
      const siblings = node.parent && 'children' in node.parent ? node.parent.children : null
      const idx = siblings ? siblings.indexOf(node) : -1
      if (idx > 0 && /^[ \t]+\S/.test(text) && text.includes('\n') && /&[a-zA-Z#0-9]+;/.test(text)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart())
        console.log(`${file.replace(/\\/g, '/')}:${line + 1}  «${text.trim().split('\n')[0].slice(0, 70)}»`)
        hits.push({ pos: node.getFullStart(), len: text.match(/^[ \t]+/)[0].length })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  count += hits.length
  if (fix && hits.length) {
    // Remplace l'espace de tête par un {' '} explicite, de la fin vers le début du fichier.
    let out = src
    for (const h of hits.sort((a, b) => b.pos - a.pos)) {
      out = out.slice(0, h.pos) + "{' '}" + out.slice(h.pos + h.len)
    }
    fs.writeFileSync(file, out)
  }
}
if (fix) console.log(count ? `\n${count} espace(s) corrigé(s).` : 'Rien à corriger.')
else console.log(count ? `\n${count} espace(s) supprimé(s) par SWC à corriger (npm run check:jsx-spaces -- --fix).` : 'Aucun espace JSX à risque.')
process.exit(count && !fix ? 1 : 0)
