/// <reference types="vite/client" />

// Some TypeScript hosts (notably certain Visual Studio configurations) type-check
// with a module target that doesn't permit `import.meta` unless it's declared.
// Vite's `vite/client` normally supplies this, but we add a defensive shim.
interface ImportMeta {
  env: Record<string, any>;
}

