export function resumeExtension(pi) {
  pi.registerCommand('piazza-resume-session', {
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) return
      pi.sendMessage({
        customType: 'piazza-resume',
        content: 'Resume the interrupted task from the existing conversation and tool results. Continue the remaining work without repeating completed work.',
        display: false,
      }, { triggerTurn: true })
    },
  })
}
