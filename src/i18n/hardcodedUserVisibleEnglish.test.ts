import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const APPROVED_LITERAL_ALLOWLIST = new Set([
  '3AZZA',
  '3AZZA App',
  '3azza',
  'EGP',
  'KM/L',
  'L',
  'psi',
  '°C',
  'YYYY-MM-DD',
]);

const USER_VISIBLE_ATTRIBUTES = new Set([
  'accessibilityHint',
  'accessibilityLabel',
  'description',
  'emptyMessage',
  'emptyTitle',
  'label',
  'placeholder',
  'subtitle',
  'title',
]);

const USER_VISIBLE_OBJECT_PROPERTIES = new Set([
  'accessibilityHint',
  'accessibilityLabel',
  'body',
  'description',
  'label',
  'message',
  'placeholder',
  'subtitle',
  'text',
  'title',
]);

type Finding = { column: number; line: number; text: string };

function normalized(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isUnapprovedEnglish(value: string): boolean {
  const text = normalized(value);
  return /[A-Za-z]{3,}/.test(text) && !APPROVED_LITERAL_ALLOWLIST.has(text);
}

function literalValue(node: ts.Node | undefined): string | null {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}

export function scanUserVisibleEnglishSource(sourceText: string, filename = 'fixture.tsx'): Finding[] {
  const source = ts.createSourceFile(filename, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const report = (node: ts.Node, value: string) => {
    if (!isUnapprovedEnglish(value)) return;
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    findings.push({ column: position.character + 1, line: position.line + 1, text: normalized(value) });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) report(node, node.text);

    if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent)) {
      const value = literalValue(node.expression);
      if (value !== null) report(node, value);
    }

    if (ts.isJsxAttribute(node) && USER_VISIBLE_ATTRIBUTES.has(node.name.getText(source))) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) report(node, node.initializer.text);
      if (node.initializer && ts.isJsxExpression(node.initializer)) {
        const value = literalValue(node.initializer.expression);
        if (value !== null) report(node, value);
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : '';
      if (USER_VISIBLE_OBJECT_PROPERTIES.has(name)) {
        const value = literalValue(node.initializer);
        if (value !== null) report(node, value);
      }
    }

    if (ts.isCallExpression(node)) {
      const isAlert = ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === 'Alert'
        && node.expression.name.text === 'alert';
      const isFocusedLoader = ts.isIdentifier(node.expression) && node.expression.text === 'useFocusedLoader';
      const argumentsToCheck = isAlert ? node.arguments.slice(0, 2) : isFocusedLoader ? node.arguments.slice(1, 3) : [];
      for (const argument of argumentsToCheck) {
        const value = literalValue(argument);
        if (value !== null) report(argument, value);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return findings;
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'i18n' && entry.name !== '__tests__') files.push(...sourceFiles(path));
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
      files.push(path);
    }
  }
  return files;
}

test('app UI contains no hard-coded user-visible English outside the documented allowlist', () => {
  const root = process.cwd();
  const files = [join(root, 'App.tsx'), ...sourceFiles(join(root, 'src'))];
  const failures = files.flatMap((file) => scanUserVisibleEnglishSource(readFileSync(file, 'utf8'), file)
    .map((finding) => `${relative(root, file)}:${finding.line}:${finding.column} ${JSON.stringify(finding.text)}`));

  assert.deepEqual(failures, [], failures.join('\n'));
});

test('scanner detects ordinary UI copy and accepts documented technical literals', () => {
  assert.equal(scanUserVisibleEnglishSource('<Text>Save vehicle</Text>').length, 1);
  assert.equal(scanUserVisibleEnglishSource('<><Text>3AZZA</Text><Text>EGP</Text><Text>KM/L</Text></>').length, 0);
});

test('directional UI icons are selected from locale direction', () => {
  const root = process.cwd();
  const files = [join(root, 'App.tsx'), ...sourceFiles(join(root, 'src'))];
  const fixed = files.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return [
      ...source.matchAll(/icon=["']arrow-back["']/g),
      ...source.matchAll(/name=["']chevron-right["']/g),
    ].map((match) => `${relative(root, file)}:${source.slice(0, match.index).split('\n').length} ${match[0]}`);
  });
  assert.deepEqual(fixed, [], fixed.join('\n'));
});
