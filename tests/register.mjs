// Run source-level tests without another bundler or a new dependency.
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

registerHooks({
    resolve(specifier, context, next) {
        if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
            const url = new URL(specifier, context.parentURL);
            if (!/\.[a-z]+$/.test(url.pathname)) {
                for (const suffix of ['.ts', '/index.ts']) {
                    const candidate = new URL(url.href + suffix);
                    if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true };
                }
            }
        }
        return next(specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('.ts')) return {
            format: 'module', shortCircuit: true,
            source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8')),
        };
        return next(url, context);
    },
});
