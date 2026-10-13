const fs = require('node:fs')
const path = require('node:path')

async function auditInterface(page, category) {
  if (process.env.LENS_UI_AUDIT !== '1' || !process.env.LENS_CAPTURE_DIR) return
  const metrics = await page.evaluate(() => {
    const visible = element => {
      const rect = element.getBoundingClientRect()
      const css = getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && css.display !== 'none' && css.visibility !== 'hidden' && Number(css.opacity) > 0.9
    }
    const color = value => {
      const match = value.match(/^rgba?\(([^)]+)\)$/)
      if (!match) return null
      const numbers = match[1].split(/[,\s/]+/).filter(Boolean).map(Number)
      return numbers.length >= 3 ? [numbers[0], numbers[1], numbers[2], numbers[3] ?? 1] : null
    }
    const blend = (front, back) => front.slice(0, 3).map((value, index) => value * front[3] + back[index] * (1 - front[3]))
    const background = element => {
      const layers = []
      for (let current = element; current; current = current.parentElement) {
        const css = getComputedStyle(current)
        if (css.backgroundImage !== 'none') return null
        const layer = color(css.backgroundColor)
        if (layer) layers.push(layer)
      }
      let result = [255, 255, 255]
      for (const layer of layers.reverse()) result = blend(layer, result)
      return result
    }
    const luminance = rgb => rgb.map(value => {
      const linear = value / 255
      return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4
    }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0)
    const nameExists = element => {
      if (element.getAttribute('role') === 'button') {
        const child = element.querySelector('button[aria-label],button[title],input[aria-label]');
        if (child && visible(child) && nameExists(child)) return true;
      }
      if (element.getAttribute('aria-label')?.trim() || element.getAttribute('title')?.trim()) return true
      const reference = element.getAttribute('aria-labelledby')
      if (reference && reference.split(/\s+/).some(id => document.getElementById(id)?.textContent?.trim())) return true
      if (element.labels?.length || element.closest('label')) return true
      if (element.matches('button,a,[role="button"]') && element.textContent?.trim()) return true
      return false
    }
    const controls = [...document.querySelectorAll('button,a[href],input:not([type="hidden"]),textarea,select,[role="button"],[role="combobox"]')].filter(visible)
    const enabled = controls.filter(element => !element.disabled && element.getAttribute('aria-disabled') !== 'true')
    const text = [...document.querySelectorAll('p,li,h1,h2,h3,h4,label,button,a,summary')].filter(element => visible(element) && element.textContent?.trim() && !element.disabled)
    let lowContrast = 0
    let unknownContrast = 0
    for (const element of text) {
      const css = getComputedStyle(element)
      const front = color(css.color)
      const back = background(element)
      if (!front || !back || Number(css.opacity) < 1) { unknownContrast++; continue }
      const a = luminance(blend(front, back))
      const b = luminance(back)
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const large = parseFloat(css.fontSize) >= 24 || (parseFloat(css.fontSize) >= 18.66 && Number(css.fontWeight) >= 700)
      if (ratio < (large ? 3 : 4.5)) lowContrast++
    }
    return {
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      pageHorizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      visibleControlCount: controls.length,
      unnamedControlCount: enabled.filter(element => !nameExists(element)).length,
      unnamedControlKinds: [...new Set(enabled.filter(element => !nameExists(element)).map(element => element.tagName.toLowerCase() + ":" + (element.getAttribute("type") || element.getAttribute("role") || "control")))],
      unnamedNestedButtonCount: enabled.filter(element => !nameExists(element) && element.querySelector("button[aria-label],button[title],input[aria-label]")).length,
      unnamedAriaHiddenCount: enabled.filter(element => !nameExists(element) && element.closest("[aria-hidden=\"true\"],[inert]")).length,
      undersizedTargetCount: enabled.filter(element => {
        if (element.matches('input,textarea,select,a')) return false
        const rect = element.getBoundingClientRect()
        return rect.width < 24 || rect.height < 24
      }).length,
      controlsOutsideHorizontalViewport: controls.filter(element => {
        const rect = element.getBoundingClientRect()
        return rect.left < -1 || rect.right > innerWidth + 1
      }).length,
      oversizedButtonCount: enabled.filter(element => element.matches('button') && element.getBoundingClientRect().height > 48).length,
      lowContrastCandidateCount: lowContrast,
      unknownContrastCount: unknownContrast
    }
  })
  const target = path.join(process.env.LENS_CAPTURE_DIR, 'lens-ui-audit-metrics.json')
  const records = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : []
  records.push({ category, ...metrics })
  fs.writeFileSync(target, JSON.stringify(records, null, 2))
}

module.exports = { auditInterface }
