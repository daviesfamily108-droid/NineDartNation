export const isDev = ((import.meta as any).env?.DEV || false) as boolean;
export function dlog(...args: any[]) {
  if (isDev) console.debug(...args);
}
export function dinfo(...args: any[]) {
  if (isDev) console.info(...args);
}
export function dwarn(...args: any[]) {
  if (isDev) console.warn(...args);
}
export function derror(...args: any[]) {
  if (isDev) console.error(...args);
}
