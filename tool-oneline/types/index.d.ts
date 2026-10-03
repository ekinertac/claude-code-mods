export type Run = { ids: string[]; tools: string[] }

declare module 'claude-code' {
  interface PluginState {
    'tool-oneline': { runs: Run[] }
  }
}
