// Ambient patches to unblock TypeScript compile for dev runs

declare interface ImportMeta {
  env?: any;
}

declare interface DetectionLogEntry {
  area?: number;
  value?: number;
}

declare const videoStyle: any;
