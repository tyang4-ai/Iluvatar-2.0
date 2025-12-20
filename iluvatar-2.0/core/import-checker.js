/**
 * ILUVATAR 3.0 - Import Checker
 *
 * Validates that all imports in a file resolve to actual files.
 * Catches missing imports before runtime errors occur.
 *
 * Supports:
 * - ES6 imports (import x from 'y')
 * - CommonJS requires (require('y'))
 * - Python imports (from x import y, import x)
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Check that all imports in a file resolve to actual files
 *
 * @param {string} filePath - Path to the file to check
 * @param {string[]} allGeneratedFiles - List of all files being generated (may not exist yet)
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<Object>} { valid: boolean, missing: Array, imports: Array }
 */
async function checkImports(filePath, allGeneratedFiles = [], projectRoot = '') {
  const content = await fs.readFile(filePath, 'utf8');
  const fileExtension = path.extname(filePath).toLowerCase();

  let imports = [];

  // Extract imports based on file type
  if (['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(fileExtension)) {
    imports = extractJavaScriptImports(content);
  } else if (['.py'].includes(fileExtension)) {
    imports = extractPythonImports(content);
  } else if (['.go'].includes(fileExtension)) {
    imports = extractGoImports(content);
  }

  const missing = [];
  const resolved = [];

  for (const imp of imports) {
    // Skip external packages
    if (isExternalPackage(imp, fileExtension)) {
      resolved.push({ import: imp, type: 'external' });
      continue;
    }

    // Resolve relative import
    const resolvedPath = resolveImportPath(imp, filePath, projectRoot);

    // Check if file exists in generated files list
    const normalizedGenerated = allGeneratedFiles.map(f => normalizePath(f));
    const normalizedResolved = normalizePath(resolvedPath);

    if (normalizedGenerated.includes(normalizedResolved)) {
      resolved.push({ import: imp, path: resolvedPath, type: 'generated' });
      continue;
    }

    // Check if file exists on disk
    const exists = await fileExists(resolvedPath);
    if (exists) {
      resolved.push({ import: imp, path: resolvedPath, type: 'existing' });
      continue;
    }

    // Try with common extensions
    const withExtension = await tryExtensions(resolvedPath, fileExtension);
    if (withExtension) {
      resolved.push({ import: imp, path: withExtension, type: 'existing' });
      continue;
    }

    // Check if it's in generated files with extensions
    const generatedWithExt = tryExtensionsSync(normalizedResolved, fileExtension, normalizedGenerated);
    if (generatedWithExt) {
      resolved.push({ import: imp, path: generatedWithExt, type: 'generated' });
      continue;
    }

    // Import is missing
    missing.push({
      import: imp,
      expected: resolvedPath,
      line: findImportLine(content, imp)
    });
  }

  return {
    valid: missing.length === 0,
    missing,
    resolved,
    totalImports: imports.length
  };
}

/**
 * Extract imports from JavaScript/TypeScript files
 */
function extractJavaScriptImports(content) {
  const imports = [];

  // ES6 imports: import x from 'y', import { x } from 'y', import 'y'
  const es6Regex = /import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = es6Regex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Dynamic imports: import('y')
  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // CommonJS requires: require('y')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return [...new Set(imports)]; // Remove duplicates
}

/**
 * Extract imports from Python files
 */
function extractPythonImports(content) {
  const imports = [];

  // from x import y, from x.y import z
  const fromRegex = /from\s+([\w.]+)\s+import/g;
  let match;
  while ((match = fromRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // import x, import x.y
  const importRegex = /^import\s+([\w.]+)/gm;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return [...new Set(imports)];
}

/**
 * Extract imports from Go files
 */
function extractGoImports(content) {
  const imports = [];

  // Single import: import "x"
  const singleRegex = /import\s+"([^"]+)"/g;
  let match;
  while ((match = singleRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Multi import: import ( "x" "y" )
  const multiRegex = /import\s*\(([\s\S]*?)\)/g;
  while ((match = multiRegex.exec(content)) !== null) {
    const block = match[1];
    const lineRegex = /["']([^"']+)["']/g;
    let lineMatch;
    while ((lineMatch = lineRegex.exec(block)) !== null) {
      imports.push(lineMatch[1]);
    }
  }

  return [...new Set(imports)];
}

/**
 * Check if an import is an external package (node_modules, standard library, etc.)
 */
function isExternalPackage(importPath, fileExtension) {
  // JavaScript/TypeScript: doesn't start with . or /
  if (['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(fileExtension)) {
    // Relative imports start with . or /
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      return false;
    }
    // Alias imports like @/ are relative
    if (importPath.startsWith('@/') || importPath.startsWith('~/')) {
      return false;
    }
    return true;
  }

  // Python: standard library and pip packages
  if (fileExtension === '.py') {
    // Relative imports in Python start with .
    if (importPath.startsWith('.')) {
      return false;
    }
    // Check common standard library modules
    const stdLibModules = [
      'os', 'sys', 'json', 'typing', 'datetime', 'collections', 'itertools',
      'functools', 'pathlib', 'subprocess', 'threading', 'asyncio', 're',
      'math', 'random', 'time', 'logging', 'unittest', 'io', 'copy'
    ];
    const topLevel = importPath.split('.')[0];
    if (stdLibModules.includes(topLevel)) {
      return true;
    }
    // Common pip packages
    const pipPackages = [
      'flask', 'django', 'fastapi', 'requests', 'numpy', 'pandas',
      'sqlalchemy', 'pydantic', 'pytest', 'redis', 'boto3', 'httpx'
    ];
    if (pipPackages.includes(topLevel)) {
      return true;
    }
    // Assume single-word imports without dots are external
    return !importPath.includes('.') && !importPath.startsWith('.');
  }

  // Go: standard library and external packages
  if (fileExtension === '.go') {
    // Standard library doesn't have dots in the path (like "fmt", "net/http")
    const stdLibPrefixes = [
      'fmt', 'net', 'http', 'os', 'io', 'strings', 'strconv', 'encoding',
      'context', 'sync', 'time', 'log', 'errors', 'path', 'testing'
    ];
    const topLevel = importPath.split('/')[0];
    if (stdLibPrefixes.includes(topLevel)) {
      return true;
    }
    // External packages usually have domain (github.com, etc.)
    return importPath.includes('.');
  }

  return false;
}

/**
 * Resolve an import path to an absolute file path
 */
function resolveImportPath(importPath, sourceFile, projectRoot) {
  const sourceDir = path.dirname(sourceFile);

  // Handle relative imports
  if (importPath.startsWith('.')) {
    return path.resolve(sourceDir, importPath);
  }

  // Handle alias imports (@/ or ~/)
  if (importPath.startsWith('@/')) {
    return path.resolve(projectRoot || sourceDir, importPath.slice(2));
  }
  if (importPath.startsWith('~/')) {
    return path.resolve(projectRoot || sourceDir, importPath.slice(2));
  }

  // Handle absolute imports (from project root)
  if (projectRoot) {
    return path.resolve(projectRoot, importPath);
  }

  return path.resolve(sourceDir, importPath);
}

/**
 * Check if a file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Try adding common extensions to find the file
 */
async function tryExtensions(basePath, sourceExtension) {
  const extensions = getExtensionsForType(sourceExtension);

  for (const ext of extensions) {
    const withExt = basePath + ext;
    if (await fileExists(withExt)) {
      return withExt;
    }

    // Try index file
    const indexPath = path.join(basePath, 'index' + ext);
    if (await fileExists(indexPath)) {
      return indexPath;
    }
  }

  return null;
}

/**
 * Try adding extensions synchronously against a list of paths
 */
function tryExtensionsSync(basePath, sourceExtension, pathList) {
  const extensions = getExtensionsForType(sourceExtension);

  for (const ext of extensions) {
    const withExt = basePath + ext;
    if (pathList.includes(normalizePath(withExt))) {
      return withExt;
    }

    // Try index file
    const indexPath = path.join(basePath, 'index' + ext);
    if (pathList.includes(normalizePath(indexPath))) {
      return indexPath;
    }
  }

  return null;
}

/**
 * Get file extensions to try based on source file type
 */
function getExtensionsForType(sourceExtension) {
  switch (sourceExtension) {
    case '.ts':
    case '.tsx':
      return ['.ts', '.tsx', '.js', '.jsx', '.json'];
    case '.js':
    case '.jsx':
    case '.mjs':
      return ['.js', '.jsx', '.mjs', '.json'];
    case '.py':
      return ['.py'];
    case '.go':
      return ['.go'];
    default:
      return [''];
  }
}

/**
 * Normalize file path for comparison
 */
function normalizePath(filePath) {
  return path.normalize(filePath).replace(/\\/g, '/').toLowerCase();
}

/**
 * Find the line number where an import appears
 */
function findImportLine(content, importPath) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(importPath)) {
      return i + 1;
    }
  }
  return null;
}

/**
 * Check imports for multiple files
 *
 * @param {string[]} filePaths - Files to check
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<Object>} { valid: boolean, fileResults: Object }
 */
async function checkMultipleFiles(filePaths, projectRoot = '') {
  const fileResults = {};
  let allValid = true;

  for (const filePath of filePaths) {
    try {
      const result = await checkImports(filePath, filePaths, projectRoot);
      fileResults[filePath] = result;
      if (!result.valid) {
        allValid = false;
      }
    } catch (err) {
      fileResults[filePath] = {
        valid: false,
        error: err.message,
        missing: [],
        resolved: []
      };
      allValid = false;
    }
  }

  return {
    valid: allValid,
    fileResults,
    totalFiles: filePaths.length,
    filesWithMissingImports: Object.values(fileResults).filter(r => !r.valid).length
  };
}

module.exports = {
  checkImports,
  checkMultipleFiles,
  extractJavaScriptImports,
  extractPythonImports,
  extractGoImports,
  isExternalPackage,
  resolveImportPath
};
