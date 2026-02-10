// Shims for tooling environments that don't understand Vite/ESM globals but still type-check source.
// These declarations are deliberately broad and only exist to keep editor/IDE builds from failing.

declare const process: any;

declare interface ImportMeta {
  env?: Record<string, any>;
}

declare module "../utils/*";
declare module "../utils/*.js";
declare module "../store/*";
declare module "../store/*.js";
declare module "./WSProvider";
declare module "./WSProvider.js";
