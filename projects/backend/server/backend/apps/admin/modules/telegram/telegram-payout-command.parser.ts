export type TelegramPayoutCommand =
  | { kind: 'APPEAL'; argument: string }
  | { kind: 'BIND'; argument: string }
  | { kind: 'DAILY_REPORT'; argument?: string }
  | { kind: 'HELP' }
  | { kind: 'MANUAL_PAYMENT'; text: string }
  | { kind: 'MY_ID' }
  | { kind: 'QUERY'; argument: string }
  | { kind: 'RECEIPT'; argument: string }
  | { kind: 'START' }
  | { kind: 'STATISTICS' }
  | { kind: 'STATUS' }
  | { kind: 'SUBMIT_BATCH' }
  | { kind: 'UNKNOWN' }

type SlashCommandKind =
  | 'APPEAL'
  | 'BIND'
  | 'HELP'
  | 'MY_ID'
  | 'QUERY'
  | 'RECEIPT'
  | 'START'
  | 'STATISTICS'
  | 'STATUS'
  | 'SUBMIT_BATCH'

const commandKinds: Record<string, SlashCommandKind> = {
  '/appeal': 'APPEAL',
  '/bind': 'BIND',
  '/help': 'HELP',
  '/myid': 'MY_ID',
  '/query': 'QUERY',
  '/receipt': 'RECEIPT',
  '/start': 'START',
  '/stats': 'STATISTICS',
  '/status': 'STATUS',
  '/submitbatch': 'SUBMIT_BATCH',
}

// A single parser keeps aliases deterministic before routing into feature handlers.
// eslint-disable-next-line complexity
export function parseTelegramPayoutCommand(input: string): TelegramPayoutCommand {
  const text = input.trim()
  if (!text) return { kind: 'UNKNOWN' }

  if (text.startsWith('/')) {
    const [rawCommand = '', ...args] = text.split(/\s+/)
    const command = rawCommand.split('@', 1)[0].toLowerCase()
    const kind = commandKinds[command]
    if (!kind) return { kind: 'UNKNOWN' }
    const argument = args.join(' ').trim()
    if (kind === 'APPEAL' || kind === 'BIND' || kind === 'QUERY' || kind === 'RECEIPT') {
      const result: TelegramPayoutCommand = { kind, argument }
      return result
    }
    switch (kind) {
      case 'HELP':
      case 'MY_ID':
      case 'START':
      case 'STATISTICS':
      case 'STATUS':
      case 'SUBMIT_BATCH':
        return { kind }
      default:
        return { kind: 'UNKNOWN' }
    }
  }

  if (text === '今日跑量' || text === '今日统计') return { kind: 'STATISTICS' }
  if (text === '提交' || text === '提交批次' || text === '提交批次订单') {
    return { kind: 'SUBMIT_BATCH' }
  }
  const prefixed = /^(查单|回单|申诉)\s+(.+)$/.exec(text)
  if (prefixed) {
    const kinds = { 查单: 'QUERY', 回单: 'RECEIPT', 申诉: 'APPEAL' } as const
    return { kind: kinds[prefixed[1] as keyof typeof kinds], argument: prefixed[2].trim() }
  }
  const report = /^日报(?:\s+(.+))?$/.exec(text)
  if (report) return { kind: 'DAILY_REPORT', ...(report[1] ? { argument: report[1].trim() } : {}) }

  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length >= 4) return { kind: 'MANUAL_PAYMENT', text }
  return { kind: 'UNKNOWN' }
}
