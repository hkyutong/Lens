import { readFileSync } from 'fs';
import { join } from 'path';
import { runInNewContext } from 'vm';
import * as ts from 'typescript';

declare const describe: any;
declare const it: any;
declare const expect: any;

describe('database initialization at application startup', () => {
  const source = ts.createSourceFile(
    'main.ts',
    readFileSync(join(__dirname, 'main.ts'), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const declarations: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer?.getText(source).includes('INIT_DB_ON_BOOT')
    ) {
      declarations.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  function initializationEnabled(value?: string): boolean {
    expect(declarations).toHaveLength(1);
    const expression = declarations[0].initializer!.getText(source);
    return Boolean(
      runInNewContext(
        ts.transpile(`(${expression})`),
        { process: { env: { INIT_DB_ON_BOOT: value } } },
        { timeout: 100 },
      ),
    );
  }

  it.each([undefined, '', 'false', '0', '1', 'TRUE', 'yes', ' true '])(
    'does not synchronize the database for an absent or invalid opt-in',
    (value: string | undefined) => {
      expect(initializationEnabled(value)).toBe(false);
    },
  );

  it('preserves explicit initialization for a new installation', () => {
    expect(initializationEnabled('true')).toBe(true);
  });

  it('keeps the initialization call behind the startup opt-in', () => {
    expect(declarations).toHaveLength(1);
    const flag = declarations[0].name.getText(source);
    const calls: ts.CallExpression[] = [];
    const collect = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === 'initDatabase'
      ) {
        calls.push(node);
      }
      ts.forEachChild(node, collect);
    };
    collect(source);
    expect(calls).toHaveLength(1);
    const guarded = calls.every(call => {
      let node: ts.Node | undefined = call.parent;
      while (node) {
        if (
          ts.isIfStatement(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === flag
        ) {
          return true;
        }
        node = node.parent;
      }
      return false;
    });
    expect(guarded).toBe(true);
  });
});
