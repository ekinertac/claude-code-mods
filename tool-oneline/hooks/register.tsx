// tool-oneline: folds tool calls in the scrollback into one line, and hides the result block.
//
// Why: a tool call normally takes a header, up to several result lines and a "+N lines" row, and a
// long agent turn buries the conversation text in that output. The stored results and what the
// model reads do not change.
// Two levels, set by the `detail` option (plugin.json userConfig):
//   calls (default)  one line per call:            ⏺ Bash(echo hello) (ctrl+o to expand)
//   runs             one line per run of calls:    ⏺ Ran 3 tools: Bash ×2, Read (ctrl+o to expand)
// A run is the calls made between two assistant messages that carry text. Rows after the first of
// a run draw nothing, so the run costs one row and no blank lines.
// How: ui.render hooks on ToolUse, ToolGroup and ToolResult. tool.call (main loop only) records the
// runs in $.state, and the render hooks read them, so a growing run redraws its line.
// ctrl+o: tool rows carry no "expanded" flag, so the flag is read from the UserMessage and
// ToolGroup rows, which do, and a change invalidates ui.render. In the expanded transcript every
// hook passes, and the engine draws full rows and results.
// Needs: any mod that replaces the user-message row (prompt-box does) must call next(e) first, or this
// mod never sees the flag when a turn has no tool group.
// Always shown: tools named in the `show` option (default SendUserFile) draw as the engine's own
// row with their output, because that output is the point of the call. They are not counted in a
// run and they end it, so the rows after one start a new run.
// Constraint: a failed call keeps its error block, because a hidden failure is worse than a long one.
// Related: ../types/index.d.ts is the $.state contract.

import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

import type { Run } from '../types'

const runs = atom({ plugin: 'tool-oneline', key: 'runs' } as const, [] as Run[])

const HINT = ' (ctrl+o to expand)'

// The one input field that says what a call is about, per tool; any other tool falls back to its
// first string field.
const KEYS: Record<string, string> = {
  Bash: 'command',
  Read: 'file_path',
  Edit: 'file_path',
  Write: 'file_path',
  NotebookEdit: 'notebook_path',
  Grep: 'pattern',
  Glob: 'pattern',
  WebFetch: 'url',
  WebSearch: 'query',
  Agent: 'description',
  Task: 'description',
}

type Call = {
  tool_use_id?: string
  tool: string
  input: unknown
  isRunning: boolean
  isErrored: boolean
  isInterrupted: boolean
}

// Module variables start over on a reload, which is fine: they only hold the view flag and the
// bookkeeping of the current turn. The runs themselves live in $.state.
let detail = 'calls'
let shown = new Set<string>()
let isExpanded = false
let isRunClosed = true // the next call opens a new run: a new turn, or a shown tool just drew
let lastCount = 0 // transcript length at the previous call: what came after it is what ended or kept the run

function subject(tool: string, input: unknown): string {
  const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const key = KEYS[tool]
  const v = key ? obj[key] : Object.values(obj).find(x => typeof x === 'string')
  // First line only: a heredoc or multi-line command must stay on one row.
  return typeof v === 'string' ? v.split('\n')[0].trim() : ''
}

function summary(tools: string[]): string {
  const counts = new Map<string, number>()
  for (const t of tools) counts.set(t, (counts.get(t) ?? 0) + 1)
  const parts = [...counts].map(([t, n]) => (n > 1 ? `${t} ×${n}` : t))
  return `Ran ${tools.length} ${tools.length === 1 ? 'tool' : 'tools'}: ${parts.join(', ')}`
}

// Declared at the top level because `claude plugin validate` only follows `$` into such functions.
function sync($: Engine, value: boolean) {
  if (isExpanded === value) return
  isExpanded = value
  // Tool rows cannot read the flag themselves, so they are asked to draw again.
  $.ui.invalidate('ui.render')
}

// isDim: the run summary is background information, so it recedes behind the conversation text.
function line(Box: any, Text: any, key: string, color: string, name: string, text: string, isDim = false) {
  return (
    <Box key={key} width="100%">
      <Box flexShrink={0} marginRight={1}>
        <Text color={color} dimColor={isDim}>⏺</Text>
      </Box>
      <Box flexShrink={1}>
        <Text wrap="truncate-end" dimColor={isDim}>
          {name ? <Text bold>{name}</Text> : null}
          {text}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text dimColor>{HINT}</Text>
      </Box>
    </Box>
  )
}

async function draw($: Engine, e: any, next: any, calls: Call[]) {
  if (isExpanded || calls.some(c => shown.has(c.tool))) return next(e)
  const { Box, Text } = $.ui.resolve(e)

  if (detail === 'runs') {
    const ids = calls.map(c => c.tool_use_id)
    const run = (await read($, runs)).find(r => r.ids.some(id => ids.includes(id)))
    if (run) {
      return ids.includes(run.ids[0]) ? line(Box, Text, 'run', 'green', '', summary(run.tools), true) : <Box display="none" />
    }
    // A call this module never saw (a resumed session, a reload): draw it as its own line.
  }

  const rows = calls.map((c, i) => {
    const arg = subject(c.tool, c.input)
    const color = c.isErrored || c.isInterrupted ? 'red' : c.isRunning ? 'yellow' : 'green'
    return line(Box, Text, String(c.tool_use_id ?? i), color, c.tool, arg ? `(${arg})` : '')
  })
  return <Box flexDirection="column" width="100%">{rows}</Box>
}

export const register: Register = (on, options) => {
  detail = options.detail === 'runs' ? 'runs' : 'calls'
  shown = new Set(String(options.show ?? '').split(',').map(t => t.trim()).filter(Boolean))

  on('turn.start', ($, e, next) => {
    isRunClosed = true
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined && shown.has(e.tool)) isRunClosed = true
    else if (e.agentId === undefined && e.tool_use_id) {
      const id = e.tool_use_id
      const messages = await $.session.messages()
      // The transcript keeps each text block and each tool call as its own assistant message, so a
      // run ends when any assistant text was written after the previous call.
      const isTextBetween = messages.slice(lastCount).some(m => m.role === 'assistant' && m.text.trim() !== '')
      lastCount = messages.length
      const startsRun = isRunClosed || isTextBetween
      isRunClosed = false
      await update($, runs, list =>
        startsRun || list.length === 0
          ? [...list, { ids: [id], tools: [e.tool] }]
          : list.map((r, i) => (i === list.length - 1 ? { ids: [...r.ids, id], tools: [...r.tools, e.tool] } : r)),
      )
    }
    return next(e)
  })

  on('ui.render', { component: 'ToolUse' }, ($, e, next) => draw($, e, next, [e.props]))

  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    sync($, e.props.isExpanded)
    return draw($, e, next, [...e.props.calls])
  })

  on('ui.render', { component: 'ToolResult' }, ($, e, next) => {
    if (isExpanded || e.props.isErrored || shown.has(e.props.tool)) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    sync($, e.props.isExpanded)
    return next(e)
  })
}
