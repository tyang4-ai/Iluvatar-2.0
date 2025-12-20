/**
 * ILUVATAR 2.0 - Import Checker Unit Tests
 *
 * Tests import validation for JavaScript, TypeScript, Python, and Go files
 * Validates that generated code has resolvable dependencies
 */

const { expect } = require('chai');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const {
  checkImports,
  checkMultipleFiles,
  extractJavaScriptImports,
  extractPythonImports,
  extractGoImports,
  isExternalPackage,
  resolveImportPath
} = require('../../core/import-checker');

describe('Import Checker', function() {
  let testDir;

  before(async function() {
    // Create temp directory for test files
    testDir = path.join(os.tmpdir(), `iluvatar-import-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  after(async function() {
    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('JavaScript Import Extraction', function() {
    it('should extract ES6 default imports', function() {
      const code = `import React from 'react';
import App from './App';`;

      const imports = extractJavaScriptImports(code);

      expect(imports).to.include('react');
      expect(imports).to.include('./App');
    });

    it('should extract ES6 named imports', function() {
      const code = `import { useState, useEffect } from 'react';
import { Button, Card } from './components';`;

      const imports = extractJavaScriptImports(code);

      expect(imports).to.include('react');
      expect(imports).to.include('./components');
    });

    it('should extract ES6 namespace imports', function() {
      const code = `import * as utils from './utils';
import * as R from 'ramda';`;

      const imports = extractJavaScriptImports(code);

      expect(imports).to.include('./utils');
      expect(imports).to.include('ramda');
    });

    it('should extract side-effect imports', function() {
      const code = `import './styles.css';
import 'normalize.css';`;

      const imports = extractJavaScriptImports(code);

      expect(imports).to.include('./styles.css');
      expect(imports).to.include('normalize.css');
    });

    it('should extract dynamic imports', function() {
      const code = `const module = await import('./dynamic-module');
const lazy = import('./lazy-component');`;

      const imports = extractJavaScriptImports(code);

      expect(imports).to.include('./dynamic-module');
      expect(imports).to.include('./lazy-component');
    });

    it('should extract CommonJS requires', function() {
      const code = `const express = require('express');
const utils = require('./utils');
const { something } = require('../lib/something');`;

      const imports = extractJavaScriptImports(code);

      expect(imports).to.include('express');
      expect(imports).to.include('./utils');
      expect(imports).to.include('../lib/something');
    });

    it('should handle mixed import styles', function() {
      const code = `import React from 'react';
const express = require('express');
import('./dynamic');`;

      const imports = extractJavaScriptImports(code);

      expect(imports).to.include('react');
      expect(imports).to.include('express');
      expect(imports).to.include('./dynamic');
    });

    it('should deduplicate imports', function() {
      const code = `import React from 'react';
import { useState } from 'react';
const R = require('react');`;

      const imports = extractJavaScriptImports(code);

      // Should only have 'react' once
      const reactCount = imports.filter(i => i === 'react').length;
      expect(reactCount).to.equal(1);
    });
  });

  describe('Python Import Extraction', function() {
    it('should extract from imports', function() {
      const code = `from flask import Flask, request
from sqlalchemy.orm import Session`;

      const imports = extractPythonImports(code);

      expect(imports).to.include('flask');
      expect(imports).to.include('sqlalchemy.orm');
    });

    it('should extract simple imports', function() {
      const code = `import os
import json
import mymodule.submodule`;

      const imports = extractPythonImports(code);

      expect(imports).to.include('os');
      expect(imports).to.include('json');
      expect(imports).to.include('mymodule.submodule');
    });

    it('should extract relative imports', function() {
      const code = `from . import utils
from .models import User
from ..config import settings`;

      const imports = extractPythonImports(code);

      expect(imports).to.include('.');
      expect(imports).to.include('.models');
      expect(imports).to.include('..config');
    });

    it('should deduplicate imports', function() {
      const code = `from flask import Flask
from flask import request`;

      const imports = extractPythonImports(code);

      const flaskCount = imports.filter(i => i === 'flask').length;
      expect(flaskCount).to.equal(1);
    });
  });

  describe('Go Import Extraction', function() {
    it('should extract single imports', function() {
      const code = `import "fmt"
import "net/http"`;

      const imports = extractGoImports(code);

      expect(imports).to.include('fmt');
      expect(imports).to.include('net/http');
    });

    it('should extract multi-line imports', function() {
      const code = `import (
  "fmt"
  "net/http"
  "encoding/json"
)`;

      const imports = extractGoImports(code);

      expect(imports).to.include('fmt');
      expect(imports).to.include('net/http');
      expect(imports).to.include('encoding/json');
    });

    it('should extract external package imports', function() {
      const code = `import (
  "github.com/gin-gonic/gin"
  "github.com/joho/godotenv"
)`;

      const imports = extractGoImports(code);

      expect(imports).to.include('github.com/gin-gonic/gin');
      expect(imports).to.include('github.com/joho/godotenv');
    });
  });

  describe('External Package Detection', function() {
    describe('JavaScript', function() {
      it('should identify npm packages as external', function() {
        expect(isExternalPackage('react', '.js')).to.be.true;
        expect(isExternalPackage('express', '.js')).to.be.true;
        expect(isExternalPackage('@anthropic-ai/sdk', '.js')).to.be.true;
      });

      it('should identify relative imports as internal', function() {
        expect(isExternalPackage('./utils', '.js')).to.be.false;
        expect(isExternalPackage('../lib/helper', '.js')).to.be.false;
        expect(isExternalPackage('/absolute/path', '.js')).to.be.false;
      });

      it('should identify alias imports as internal', function() {
        expect(isExternalPackage('@/components', '.js')).to.be.false;
        expect(isExternalPackage('~/utils', '.js')).to.be.false;
      });
    });

    describe('Python', function() {
      it('should identify standard library as external', function() {
        expect(isExternalPackage('os', '.py')).to.be.true;
        expect(isExternalPackage('json', '.py')).to.be.true;
        expect(isExternalPackage('datetime', '.py')).to.be.true;
      });

      it('should identify pip packages as external', function() {
        expect(isExternalPackage('flask', '.py')).to.be.true;
        expect(isExternalPackage('fastapi', '.py')).to.be.true;
        expect(isExternalPackage('numpy', '.py')).to.be.true;
      });

      it('should identify relative imports as internal', function() {
        expect(isExternalPackage('.utils', '.py')).to.be.false;
        expect(isExternalPackage('..models', '.py')).to.be.false;
      });
    });

    describe('Go', function() {
      it('should identify standard library as external', function() {
        expect(isExternalPackage('fmt', '.go')).to.be.true;
        expect(isExternalPackage('net/http', '.go')).to.be.true;
        expect(isExternalPackage('encoding/json', '.go')).to.be.true;
      });

      it('should identify external packages as external', function() {
        expect(isExternalPackage('github.com/gin-gonic/gin', '.go')).to.be.true;
        expect(isExternalPackage('golang.org/x/crypto', '.go')).to.be.true;
      });
    });
  });

  describe('Import Path Resolution', function() {
    it('should resolve relative paths', function() {
      // Use testDir as base to ensure cross-platform compatibility
      const projectRoot = testDir;
      const componentsDir = path.join(projectRoot, 'src', 'components');
      const sourceFile = path.join(componentsDir, 'Button.js');
      const result = resolveImportPath('./styles', sourceFile, projectRoot);

      expect(result).to.equal(path.join(componentsDir, 'styles'));
    });

    it('should resolve parent directory paths', function() {
      const projectRoot = testDir;
      const componentsDir = path.join(projectRoot, 'src', 'components');
      const sourceFile = path.join(componentsDir, 'Button.js');
      const result = resolveImportPath('../utils', sourceFile, projectRoot);

      expect(result).to.equal(path.join(projectRoot, 'src', 'utils'));
    });

    it('should resolve @/ alias paths', function() {
      const projectRoot = testDir;
      const componentsDir = path.join(projectRoot, 'src', 'components');
      const sourceFile = path.join(componentsDir, 'Button.js');
      const result = resolveImportPath('@/utils', sourceFile, projectRoot);

      expect(result).to.equal(path.join(projectRoot, 'utils'));
    });

    it('should resolve ~/ alias paths', function() {
      const projectRoot = testDir;
      const componentsDir = path.join(projectRoot, 'src', 'components');
      const sourceFile = path.join(componentsDir, 'Button.js');
      const result = resolveImportPath('~/lib', sourceFile, projectRoot);

      expect(result).to.equal(path.join(projectRoot, 'lib'));
    });
  });

  describe('Full Import Check', function() {
    it('should pass when all imports exist', async function() {
      // Create test files
      const mainFile = path.join(testDir, 'main.js');
      const utilsFile = path.join(testDir, 'utils.js');

      await fs.writeFile(utilsFile, 'module.exports = {}');
      await fs.writeFile(mainFile, `
        const utils = require('./utils');
        const express = require('express');
      `);

      const result = await checkImports(mainFile, [mainFile, utilsFile], testDir);

      expect(result.valid).to.be.true;
      expect(result.missing).to.be.empty;
    });

    it('should detect missing internal imports', async function() {
      const mainFile = path.join(testDir, 'app.js');

      await fs.writeFile(mainFile, `
        import { helper } from './missing-file';
        import config from './config';
      `);

      const result = await checkImports(mainFile, [mainFile], testDir);

      expect(result.valid).to.be.false;
      expect(result.missing.length).to.be.greaterThan(0);
    });

    it('should pass for generated files not yet on disk', async function() {
      const mainFile = path.join(testDir, 'generated-main.js');
      const futureFile = path.join(testDir, 'generated-utils.js');

      await fs.writeFile(mainFile, `
        const utils = require('./generated-utils');
      `);

      // futureFile is in the list but doesn't exist yet
      const result = await checkImports(mainFile, [mainFile, futureFile], testDir);

      expect(result.valid).to.be.true;
    });

    it('should handle files with no imports', async function() {
      const noImportsFile = path.join(testDir, 'standalone.js');

      await fs.writeFile(noImportsFile, `
        const x = 1 + 2;
        console.log(x);
      `);

      const result = await checkImports(noImportsFile, [], testDir);

      expect(result.valid).to.be.true;
      expect(result.totalImports).to.equal(0);
    });

    it('should find import line numbers', async function() {
      const fileWithMissing = path.join(testDir, 'with-line-nums.js');

      await fs.writeFile(fileWithMissing, `import React from 'react';
import missing from './does-not-exist';
const x = 1;`);

      const result = await checkImports(fileWithMissing, [], testDir);

      expect(result.missing.length).to.equal(1);
      expect(result.missing[0].line).to.equal(2);
    });
  });

  describe('Multiple File Check', function() {
    it('should check all files and report results', async function() {
      const file1 = path.join(testDir, 'multi-1.js');
      const file2 = path.join(testDir, 'multi-2.js');
      const file3 = path.join(testDir, 'shared.js');

      await fs.writeFile(file3, 'module.exports = {}');
      await fs.writeFile(file1, `const shared = require('./shared');`);
      await fs.writeFile(file2, `const missing = require('./not-here');`);

      const result = await checkMultipleFiles([file1, file2, file3], testDir);

      expect(result.totalFiles).to.equal(3);
      expect(result.valid).to.be.false;
      expect(result.filesWithMissingImports).to.equal(1);
    });

    it('should handle file read errors gracefully', async function() {
      const validFile = path.join(testDir, 'valid-multi.js');
      const invalidPath = path.join(testDir, 'nonexistent.js');

      await fs.writeFile(validFile, 'const x = 1;');

      const result = await checkMultipleFiles([validFile, invalidPath], testDir);

      expect(result.valid).to.be.false;
      expect(result.fileResults[invalidPath].error).to.exist;
    });
  });

  describe('TypeScript Support', function() {
    it('should handle .ts files', async function() {
      const tsFile = path.join(testDir, 'app.ts');
      const typesFile = path.join(testDir, 'types.ts');

      await fs.writeFile(typesFile, 'export type User = { name: string };');
      await fs.writeFile(tsFile, `
        import { User } from './types';
        import express from 'express';
      `);

      const result = await checkImports(tsFile, [tsFile, typesFile], testDir);

      expect(result.valid).to.be.true;
    });

    it('should handle .tsx files', async function() {
      const tsxFile = path.join(testDir, 'Component.tsx');

      await fs.writeFile(tsxFile, `
        import React from 'react';
        export const Component = () => <div>Hello</div>;
      `);

      const result = await checkImports(tsxFile, [tsxFile], testDir);

      // Only external import (react), should be valid
      expect(result.valid).to.be.true;
    });
  });

  describe('Index File Resolution', function() {
    it('should resolve directory imports to index files', async function() {
      const componentDir = path.join(testDir, 'components');
      const indexFile = path.join(componentDir, 'index.js');
      const mainFile = path.join(testDir, 'index-test.js');

      await fs.mkdir(componentDir, { recursive: true });
      await fs.writeFile(indexFile, 'module.exports = {}');
      await fs.writeFile(mainFile, `const components = require('./components');`);

      const result = await checkImports(mainFile, [mainFile, indexFile], testDir);

      expect(result.valid).to.be.true;
    });
  });
});
