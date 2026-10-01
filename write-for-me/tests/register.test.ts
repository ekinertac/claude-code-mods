import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'write-for-me',
  component: 'AbovePrompt',
  surface: 'terminal',
  viewport: { columns: 100, rows: 30 },
  props: { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 100, scroll: { offset: 0, bodyRows: 5 }, view: {} },
} as const

const CHAT = [
  { role: 'user', text: 'add a retry to fetch_user in api.py', toolUses: [] },
  { role: 'assistant', text: 'Done, 3 attempts with backoff.', toolUses: [] },
]

function stubs(on, draft: string, messages: unknown[], answer: { isAnswered: boolean; text?: string; reason?: string }) {
  const filled: unknown[] = []
  const toasts: string[] = []
  const asked: any[] = []
  on('ui.render', () => ({ type: 'Text', props: {}, children: [''] }))
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('session.messages', () => ({ value: messages }))
  on('model.complete', (_$, e) => {
    asked.push(e)
    return { value: answer }
  })
  on('prompt.fill', (_$, e) => {
    filled.push(e)
    return { isFilled: true }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { filled, toasts, asked }
}

test('an empty box is filled with the proposed next prompt', async ($, on) => {
  const { filled, asked } = stubs(on, '', CHAT, { isAnswered: true, text: '  Now add a test for the retry.\n' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'write' })
  expect(filled).toMatchObject([{ text: 'Now add a test for the retry.', mode: 'replace' }])
  expect(asked[0].prompt).toContain('add a retry to fetch_user')
  expect(asked[0].prompt).not.toContain('Hint')
})

test('a draft is sent to the model as a hint', async ($, on) => {
  const { asked } = stubs(on, 'tests too', CHAT, { isAnswered: true, text: 'x' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'write' })
  expect(asked[0].prompt).toContain('Hint from the developer: tests too')
})

test('an empty conversation is left alone', async ($, on) => {
  const { filled, toasts } = stubs(on, '', [], { isAnswered: true, text: 'x' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'write' })
  expect(filled).toEqual([])
  expect(toasts).toContain('write-for-me: nothing to go on yet, start the conversation first')
})

test('a failed model call keeps the box and says why', async ($, on) => {
  const { filled, toasts } = stubs(on, 'tests too', CHAT, { isAnswered: false, reason: 'overloaded' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'write' })
  expect(filled).toEqual([])
  expect(toasts).toContain('write-for-me failed: overloaded')
})
