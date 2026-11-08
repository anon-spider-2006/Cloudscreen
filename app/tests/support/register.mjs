// Node-only boundaries: exercise the real store/engine with real web storage,
// replacing only device notification/location APIs that Node cannot load.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const src = fileURLToPath(new URL('../../src/', import.meta.url));
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/services/notifications') return { url: new URL('./notifications.ts', import.meta.url).href, shortCircuit: true };
    if (specifier === 'expo-location') return { url: new URL('./location.ts', import.meta.url).href, shortCircuit: true };
    if (specifier.startsWith('@/') || specifier === './storage') {
      const base = specifier === './storage' ? path.join(src, 'state/storage.web') : path.join(src, specifier.slice(2));
      for (const candidate of [base + '.ts', path.join(base, 'index.ts')]) {
        if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
