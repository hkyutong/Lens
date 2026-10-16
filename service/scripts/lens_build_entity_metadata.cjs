'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Emit only the entity dependency graph. Loading it never starts the application.
function buildEntityMetadata(serviceRoot) {
  const ts = require(path.join(serviceRoot, 'node_modules/typescript'));
  const sourceRoot = path.join(serviceRoot, 'src');
  const outputRoot = path.join(serviceRoot, 'dist', 'entities');
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('entity_source_invalid');
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith('.entity.ts')) files.push(file);
    }
  }
  visit(sourceRoot);
  if (!files.length) throw new Error('entity_source_invalid');
  const config = ts.readConfigFile(path.join(serviceRoot, 'tsconfig.json'), ts.sys.readFile);
  if (config.error) throw new Error('entity_config_invalid');
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, serviceRoot);
  if (parsed.errors.length) throw new Error('entity_config_invalid');
  const options = { ...parsed.options, rootDir: sourceRoot, outDir: outputRoot,
    module: ts.ModuleKind.CommonJS, declaration: false, declarationMap: false,
    sourceMap: false, inlineSourceMap: false, incremental: false, noEmit: false,
    noEmitOnError: true };
  const program = ts.createProgram(files.sort(), options);
  for (const source of program.getSourceFiles().filter(file => !file.isDeclarationFile)) {
    const relative = path.relative(sourceRoot, source.fileName);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('entity_source_invalid');
  }
  if (ts.getPreEmitDiagnostics(program).some(item => item.category === ts.DiagnosticCategory.Error)) {
    throw new Error('entity_compile_failed');
  }
  // Existing entities use src/ imports. Resolve those to portable local imports
  // in the emitted graph, without changing the application resolver.
  const relativeImports = context => source => {
    const visitNode = node => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) &&
          node.moduleSpecifier.text.startsWith('src/')) {
        const target = path.join(serviceRoot, node.moduleSpecifier.text);
        let relative = path.relative(path.dirname(source.fileName), target).split(path.sep).join('/');
        if (!relative.startsWith('.')) relative = './' + relative;
        return ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause,
          ts.factory.createStringLiteral(relative), node.attributes);
      }
      return ts.visitEachChild(node, visitNode, context);
    };
    return ts.visitNode(source, visitNode);
  };
  if (fs.existsSync(outputRoot)) fs.rmSync(outputRoot, { recursive: true });
  const emitted = program.emit(undefined, undefined, undefined, false, { before: [relativeImports] });
  if (emitted.emitSkipped || emitted.diagnostics.some(item => item.category === ts.DiagnosticCategory.Error)) {
    throw new Error('entity_compile_failed');
  }
  return { passed: true, entity_count: files.length };
}

module.exports = { buildEntityMetadata };
if (require.main === module) {
  try { process.stdout.write(JSON.stringify(buildEntityMetadata(path.resolve(__dirname, '..'))) + '\n'); }
  catch (_) { process.stdout.write('{"passed":false,"error":"entity_compile_failed"}\n'); process.exitCode = 1; }
}
