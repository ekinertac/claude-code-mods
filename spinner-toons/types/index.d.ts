export type Toon = string

declare module 'claude-code' {
  interface PluginState {
    'spinner-toons': { toon: Toon | null }
  }
}
