import { expect, test } from 'claude-code/testing'

const ROW = (origin: object, text = 'fix the login bug') =>
  ({
    component: 'UserMessage',
    surface: 'terminal',
    viewport: { columns: 100, rows: 30 },
    props: { text, origin, isExpanded: false },
  }) as const

const seen = (tree: any): string => JSON.stringify(tree)

test('a typed prompt is drawn in a thick colored box with its text', async ($, on) => {
  on('ui.render', (_$, e) => ({ type: 'Text', props: {}, children: ['engine row'] }))
  const tree = seen(await $.ui.render(ROW({ kind: 'composer' })))
  expect(tree).toContain('fix the login bug')
  expect(tree).toContain('"borderStyle":"bold"')
})

test('a task notification keeps the engine row', async ($, on) => {
  on('ui.render', (_$, e) => ({ type: 'Text', props: {}, children: ['engine row'] }))
  const tree = seen(await $.ui.render(ROW({ kind: 'task-notification' })))
  expect(tree).toContain('engine row')
  expect(tree).not.toContain('borderStyle')
})

test('a long prompt is passed whole and wraps', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: [''] }))
  const long = 'word '.repeat(80).trim()
  const tree = seen(await $.ui.render(ROW({ kind: 'composer' }, long)))
  expect(tree).toContain(long)
  expect(tree).toContain('"wrap":"wrap"')
})
