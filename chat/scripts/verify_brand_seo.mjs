import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = name => readFileSync(path.join(root, name), 'utf8')
const brand = 'Lens 学术GPT'
const englishBrand = 'Lens Academic GPT'
const html = read('index.html')

function metadata(source) {
  const result = new Map()
  for (const tag of source.matchAll(/<meta\b[^>]*>/g)) {
    const attrs = Object.fromEntries([...tag[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]))
    if (attrs.name || attrs.property) result.set(attrs.name || attrs.property, attrs.content)
  }
  return result
}

const staticMeta = metadata(html)
assert.equal(html.match(/<title>([^<]+)<\/title>/)?.[1], brand)
assert.equal(staticMeta.get('og:site_name'), brand)
assert.equal(staticMeta.get('application-name'), brand)
assert.ok(staticMeta.get('description').startsWith(brand))
assert.equal(staticMeta.get('og:description'), staticMeta.get('description'))
assert.equal(staticMeta.get('twitter:description'), staticMeta.get('description'))
const staticData = JSON.parse(html.match(/<script id="app-ld-json"[^>]*>([\s\S]*?)<\/script>/)[1])
const website = staticData.find(item => item['@type'] === 'WebSite')
assert.equal(website.name, brand)
assert.ok(website.alternateName.includes(englishBrand))
assert.equal(staticData.find(item => item['@type'] === 'SoftwareApplication').name, brand)

// Execute the actual SEO functions so hydration cannot silently replace the static brand.
const script = read('src/App.vue').match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]
const parsed = ts.createSourceFile('App.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const constants = new Set(['productName', 'publisherName', 'brandSeoTitle', 'siteDescription', 'siteKeywords'])
const functions = new Set(['toAbsoluteUrl', 'setOrCreateMeta', 'setOrCreateLink', 'updateStructuredData', 'setDocumentTitle', 'syncDocumentSeo'])
const selected = parsed.statements.filter(node =>
  ts.isFunctionDeclaration(node) ? functions.has(node.name?.text) :
    ts.isVariableStatement(node) && node.declarationList.declarations.every(d => constants.has(d.name.getText(parsed)))
).map(node => node.getText(parsed)).join('\n')
const elements = new Map()
const structured = { textContent: '' }
const document = {
  title: '',
  head: { querySelector: selector => elements.get(selector), appendChild: element => {
    const [key, value] = Object.entries(element.attrs)[0]
    elements.set(`${element.tag}[${key}="${value}"]`, element)
  } },
  createElement: tag => ({ tag, attrs: {}, setAttribute(key, value) { this.attrs[key] = value } }),
  getElementById: id => id === 'app-ld-json' ? structured : null,
}
const context = { document, URL, window: { location: new URL('https://example.test/') }, siteUrl: { value: '' }, faviconPath: { value: '/favicon.svg' } }
vm.runInNewContext(ts.transpile(selected, { target: ts.ScriptTarget.ES2022 }) + '\nsyncDocumentSeo()', context)
assert.equal(document.title, brand)
for (const key of ['description', 'application-name', 'og:site_name', 'og:title', 'og:description', 'twitter:title', 'twitter:description']) {
  const selector = `meta[${key.startsWith('og:') ? 'property' : 'name'}="${key}"]`
  assert.equal(elements.get(selector)?.attrs.content, staticMeta.get(key), `Static/runtime metadata differ: ${key}`)
}
const runtimeData = JSON.parse(structured.textContent)
assert.equal(runtimeData.find(item => item['@type'] === 'WebSite').name, website.name)
assert.deepEqual(runtimeData.find(item => item['@type'] === 'WebSite').alternateName, website.alternateName)

const manifest = JSON.parse(read('public/icon/manifest.webmanifest'))
assert.equal(manifest.name, brand)
assert.equal(manifest.short_name, 'Lens')
for (const name of readdirSync(path.join(root, 'public/seo')).filter(name => name.endsWith('.html'))) {
  const page = read(`public/seo/${name}`)
  assert.ok(!page.includes('Lens by YutoAI'), `Old brand remains: ${name}`)
  assert.ok(page.includes(/<html[^>]*lang="zh/.test(page) ? brand : englishBrand), `Brand missing: ${name}`)
}
for (const name of ['llms.txt', 'llms-full.txt']) assert.ok(read(`public/${name}`).startsWith(`# ${englishBrand} (${brand})`))
const adminHtml = read('../admin/index.html')
assert.ok(metadata(adminHtml).get('robots')?.includes('noindex'))
assert.ok(adminHtml.includes('管理后台</title>'))
assert.ok(!read('../admin/src/layouts/components/Logo/index.vue').includes('pkg.version'))
console.log(JSON.stringify({ brand_contract_passed: true, runtime_static_parity: true, admin_noindex: true }))
