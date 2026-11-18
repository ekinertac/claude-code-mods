// Type contract of subagent-router's $.state: the per-session override of the global on/off switch.
// 'none' means the session follows the global default kept in $.store.
export type Override = 'on' | 'off' | 'none'

declare module 'claude-code' {
  interface PluginState {
    'subagent-router': { override: Override }
  }
}
