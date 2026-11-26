import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import ts from 'typescript'

// Use the repository's existing TypeScript compiler; no test packages needed.
const root = fileURLToPath(new URL('../', import.meta.url))
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true }
    // Next's bundler resolves this extensionless public entry; native Node ESM
    // needs the file extension when rendering the real Link in UI contract tests.
    if (specifier === 'next/link') return nextResolve('next/link.js', context)
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const base = specifier.startsWith('@/') ? path.join(root, specifier.slice(2)) : fileURLToPath(new URL(specifier, context.parentURL))
      for (const extension of ['', '.ts', '.tsx', '.js']) {
        const candidate = base + extension
        if (existsSync(candidate) && /\.[cm]?[jt]sx?$/.test(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && /\.tsx?$/.test(url)) {
      const output = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      })
      return { format: 'module', source: output.outputText, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})
