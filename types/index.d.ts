declare module 'claude-code' {
  interface PluginState {
    'raw-markdown': { isRaw: boolean; flippedBlocks: string[]; copiedKey: string | null }
  }
}
