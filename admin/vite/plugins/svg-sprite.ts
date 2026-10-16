import fs from 'node:fs';
import path from 'node:path';
import { optimize, type Config } from 'svgo';
import type { Plugin } from 'vite';

interface SpriteOptions {
  iconDirs: string[];
  symbolId?: string;
  svgoOptions?: boolean | Config;
}

const registerId = 'virtual:svg-icons-register';
const namesId = 'virtual:svg-icons-names';
const domId = '__svg__icons__dom__';

export function compileSvgSprite(options: SpriteOptions): { ids: string[]; symbols: string } {
  const ids: string[] = [];
  const symbols: string[] = [];
  const seen = new Set<string>();
  const pattern = options.symbolId ?? 'icon-[dir]-[name]';

  function collect(directory: string, root: string) {
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Invalid SVG source');
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Invalid SVG source');
      if (entry.isDirectory()) {
        collect(file, root);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.svg')) continue;
      const relative = path.relative(root, file).split(path.sep).join('/');
      const folder = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
      const id = pattern.replace('[dir]', folder.replaceAll('/', '-'))
        .replace('[name]', path.posix.basename(relative, '.svg')).replace(/--+/g, '-');
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id) || seen.has(id)) {
        throw new Error('Invalid SVG symbol');
      }
      let source = fs.readFileSync(file, 'utf8');
      if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('Invalid SVG source');
      if (options.svgoOptions !== false) {
        const config = typeof options.svgoOptions === 'object' ? options.svgoOptions : {};
        source = optimize(source, {
          ...config,
          plugins: config.plugins ?? [
            { name: 'preset-default', params: { overrides: { removeViewBox: false } } },
            { name: 'prefixIds', params: { prefix: id } },
          ],
        }).data;
      }
      source = source.replace(/^\s*<\?xml[^>]*\?>\s*/i, '').trim();
      const svg = /^<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i.exec(source);
      if (!svg) throw new Error('Invalid SVG source');
      let rootAttributes = svg[1];
      if (!/\bviewBox\s*=/.test(rootAttributes)) {
        const width = /\bwidth\s*=\s*["']([0-9.]+)(?:px)?["']/.exec(rootAttributes);
        const height = /\bheight\s*=\s*["']([0-9.]+)(?:px)?["']/.exec(rootAttributes);
        if (!width || !height || Number(width[1]) <= 0 || Number(height[1]) <= 0) {
          throw new Error('Invalid SVG dimensions');
        }
        rootAttributes += ` viewBox="0 0 ${width[1]} ${height[1]}"`;
      }
      const attributes = rootAttributes.replace(
        /\s(?:xmlns(?::[\w-]+)?|width|height|id)\s*=\s*(?:"[^"]*"|'[^']*')/g,
        '',
      );
      symbols.push(`<symbol id="${id}"${attributes}>${svg[2]}</symbol>`);
      ids.push(id);
      seen.add(id);
    }
  }

  for (const directory of options.iconDirs) collect(directory, directory);
  return { ids, symbols: symbols.join('') };
}

export function createSvgIconsPlugin(options: SpriteOptions): Plugin {
  return {
    name: 'lens-svg-sprite',
    resolveId(id) {
      if (id === registerId || id === namesId) return `\0${id}`;
    },
    load(id) {
      if (id !== `\0${registerId}` && id !== `\0${namesId}`) return;
      const sprite = compileSvgSprite(options);
      if (id === `\0${namesId}`) return `export default ${JSON.stringify(sprite.ids)};`;
      return `
function mountSprite() {
  const previous = document.getElementById(${JSON.stringify(domId)});
  if (previous) previous.remove();
  const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sprite.id = ${JSON.stringify(domId)};
  sprite.setAttribute('aria-hidden', 'true');
  sprite.style.position = 'absolute';
  sprite.style.width = '0';
  sprite.style.height = '0';
  sprite.style.overflow = 'hidden';
  sprite.innerHTML = ${JSON.stringify(sprite.symbols)};
  document.body.appendChild(sprite);
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountSprite, { once: true });
  } else {
    mountSprite();
  }
}
export default ${JSON.stringify(sprite.ids)};
`;
    },
    configureServer(server) {
      server.watcher.add(options.iconDirs);
    },
    handleHotUpdate(context) {
      const relativePaths = options.iconDirs.map(directory => path.relative(directory, context.file));
      if (!context.file.endsWith('.svg') || !relativePaths.some(relative =>
        relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) return;
      for (const id of [registerId, namesId]) {
        const module = context.server.moduleGraph.getModuleById(`\0${id}`);
        if (module) context.server.moduleGraph.invalidateModule(module);
      }
      context.server.ws.send({ type: 'full-reload' });
      return [];
    },
  };
}
