declare module 'claude-code' {
  interface PluginState {
    'copy-as': { isRaw: boolean; flippedBlocks: string[]; copiedKey: string | null }
  }
}
