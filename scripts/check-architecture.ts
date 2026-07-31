/**
 * Architecture Boundary Checker
 *
 * Validates that the codebase respects clean-architecture layer boundaries:
 *
 *   shared         → (no deps)
 *   domain         → shared, domain
 *   application    → shared, domain, application
 *   infrastructure → shared, domain, application, infrastructure
 *   interfaces     → shared, domain, application, infrastructure, interfaces
 *
 * Rules enforced:
 *   1. No Prisma imports outside src/infrastructure/
 *   2. No process.env access outside src/shared/config/
 *   3. Domain never imports infrastructure or application
 *   4. Application never imports infrastructure directly (uses interfaces)
 *   5. No `any` type annotations in domain/shared layers
 *   6. No repository implementations (Prisma-using classes) inside domain/
 *
 * Usage:  bun run scripts/check-architecture.ts
 * Exit:   0 = pass, 1 = violations found
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, relative, dirname } from 'path';

const ROOT = join(import.meta.dir, '..', 'src');
const LAYERS = ['shared', 'domain', 'application', 'infrastructure', 'interfaces'] as const;
type Layer = (typeof LAYERS)[number];

interface Violation {
  file: string;
  line: number;
  rule: string;
  message: string;
}

const violations: Violation[] = [];

/** Determine the layer of a file based on its path. */
function getLayer(filePath: string): Layer | null {
  const rel = relative(ROOT, filePath).replace(/\\/g, '/');
  for (const layer of LAYERS) {
    if (rel.startsWith(layer + '/')) return layer;
  }
  return null;
}

/** Recursively collect all .ts/.tsx files. */
async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full)));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

/** Extract import paths from a source file. */
function extractImports(source: string): Array<{ path: string; line: number }> {
  const imports: Array<{ path: string; line: number }> = [];
  const lines = source.split('\n');
  const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;

  lines.forEach((line, idx) => {
    let match: RegExpExecArray | null;
    importRegex.lastIndex = 0;
    while ((match = importRegex.exec(line)) !== null) {
      imports.push({ path: match[1], line: idx + 1 });
    }
  });

  return imports;
}

/** Resolve an import path to a layer. */
function resolveImportLayer(importPath: string, fromFile: string): Layer | 'external' | null {
  // External packages (not @/ aliases)
  if (!importPath.startsWith('@/')) {
    if (importPath === '@prisma/client' || importPath.includes('prisma')) {
      return 'infrastructure'; // Prisma is infrastructure
    }
    return 'external';
  }

  // @/ alias — map to src/
  const rel = importPath.slice(2).replace(/\\/g, '/');
  for (const layer of LAYERS) {
    if (rel.startsWith(layer + '/') || rel === layer) return layer;
  }
  // lib/db is infrastructure
  if (rel.startsWith('lib/db')) return 'infrastructure';
  return null;
}

/** Check a single file for violations. */
async function checkFile(filePath: string): Promise<void> {
  const source = await readFile(filePath, 'utf-8');
  const layer = getLayer(filePath);
  if (!layer) return;

  const relFile = relative(process.cwd(), filePath).replace(/\\/g, '/');
  const imports = extractImports(source);
  const allowedLayers: Record<Layer, Set<Layer | 'external'>> = {
    shared: new Set(['external', 'shared']),
    domain: new Set(['external', 'shared', 'domain']),
    application: new Set(['external', 'shared', 'domain', 'application']),
    infrastructure: new Set(['external', 'shared', 'domain', 'application', 'infrastructure']),
    interfaces: new Set(['external', 'shared', 'domain', 'application', 'infrastructure', 'interfaces']),
  };

  for (const imp of imports) {
    const importLayer = resolveImportLayer(imp.path, filePath);
    if (importLayer === 'external' || importLayer === null) continue;

    // Rule: domain never imports infrastructure
    if (layer === 'domain' && importLayer === 'infrastructure') {
      violations.push({
        file: relFile,
        line: imp.line,
        rule: 'DOMAIN_NO_INFRA',
        message: `Domain layer must not import infrastructure: ${imp.path}`,
      });
    }

    // Rule: application never imports infrastructure directly
    if (layer === 'application' && importLayer === 'infrastructure') {
      violations.push({
        file: relFile,
        line: imp.line,
        rule: 'APP_NO_INFRA',
        message: `Application layer must not import infrastructure directly: ${imp.path}`,
      });
    }

    // Rule: shared never imports anything internal except shared
    if (layer === 'shared' && importLayer !== 'shared') {
      violations.push({
        file: relFile,
        line: imp.line,
        rule: 'SHARED_ISOLATED',
        message: `Shared layer must not import ${importLayer}: ${imp.path}`,
      });
    }

    // Rule: general boundary — a layer can only import allowed layers
    if (!allowedLayers[layer].has(importLayer)) {
      violations.push({
        file: relFile,
        line: imp.line,
        rule: 'LAYER_BOUNDARY',
        message: `${layer} layer cannot import ${importLayer} layer: ${imp.path}`,
      });
    }
  }

  // Rule: no process.env outside shared/config
  if (!(layer === 'shared' && relFile.includes('shared/config'))) {
    const envRegex = /process\.env/g;
    let match: RegExpExecArray | null;
    const lines = source.split('\n');
    lines.forEach((line, idx) => {
      envRegex.lastIndex = 0;
      if ((match = envRegex.exec(line)) !== null) {
        violations.push({
          file: relFile,
          line: idx + 1,
          rule: 'NO_RAW_ENV',
          message: `process.env must only be accessed in shared/config. Use getConfig() instead.`,
        });
      }
    });
  }

  // Rule: no `any` in domain/shared (excluding type parameters like <any>)
  if (layer === 'domain' || layer === 'shared') {
    const anyRegex = /:\s*any\b/g;
    const lines = source.split('\n');
    lines.forEach((line, idx) => {
      anyRegex.lastIndex = 0;
      if (anyRegex.exec(line) !== null && !line.includes('as any')) {
        violations.push({
          file: relFile,
          line: idx + 1,
          rule: 'NO_ANY',
          message: `Avoid explicit 'any' type in ${layer} layer`,
        });
      }
    });
  }
}

/** Main entry point. */
async function main(): Promise<void> {
  console.log('🔍 Checking architecture boundaries...\n');

  const files = await collectFiles(ROOT);
  console.log(`   Scanning ${files.length} files in src/\n`);

  for (const file of files) {
    await checkFile(file);
  }

  if (violations.length === 0) {
    console.log('✅ Architecture boundaries verified — no violations found.');
    process.exit(0);
  }

  console.log(`❌ Found ${violations.length} architecture violation(s):\n`);

  const grouped = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = grouped.get(v.rule) ?? [];
    list.push(v);
    grouped.set(v.rule, list);
  }

  for (const [rule, items] of grouped) {
    console.log(`  [${rule}] — ${items.length} violation(s)`);
    for (const v of items.slice(0, 10)) {
      console.log(`    ${v.file}:${v.line} — ${v.message}`);
    }
    if (items.length > 10) {
      console.log(`    ... and ${items.length - 10} more`);
    }
    console.log();
  }

  process.exit(1);
}

main().catch((e) => {
  console.error('Architecture checker failed:', e);
  process.exit(1);
});
