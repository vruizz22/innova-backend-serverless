'use strict';

// serverless-esbuild (esbuild) does NOT honor `emitDecoratorMetadata`, so the
// bundle ships without `design:paramtypes`. NestJS resolves constructor
// dependencies by that metadata, so without it every injected dependency
// resolves to `undefined` — crashing services that use a dependency at
// construction time and silently breaking the rest at runtime.
//
// This esbuild plugin routes the project's own .ts files through the TypeScript
// transpiler (already a dependency) so the decorator metadata is preserved.
// esbuild still performs module resolution (incl. tsconfig path aliases) and
// bundling on the emitted JS. node_modules are left to esbuild's fast path.
const ts = require('typescript');
const fs = require('fs');

/** @type {import('esbuild').Plugin} */
const tsDecoratorMetadata = {
  name: 'ts-decorator-metadata',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      if (args.path.includes('node_modules')) return undefined;
      const source = await fs.promises.readFile(args.path, 'utf8');
      const { outputText } = ts.transpileModule(source, {
        fileName: args.path,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          target: ts.ScriptTarget.ES2021,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          useDefineForClassFields: false,
          esModuleInterop: true,
          importHelpers: false,
        },
      });
      return { contents: outputText, loader: 'js' };
    });
  },
};

module.exports = [tsDecoratorMetadata];
