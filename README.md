# claude-code-mods

Claude Code mods I use daily.

- `rewrite-prompt`: press Ctrl+P and the draft in the prompt box is rewritten in place by a model (Sonnet, on your plan). Nothing is sent until you press Enter, and Ctrl+_ undoes it.
- `write-for-me`: press Ctrl+N and the next prompt is written for you from the last 12 messages of the conversation. If the box has text, it is used as a hint ("tests too") and expanded. Nothing is sent, and Ctrl+_ undoes it.
- `prompt-box`: the prompts you type are drawn in the scrollback inside a thick cyan box instead of one `> text` line. Task notifications and messages from other sessions keep their normal rows. No key binding needed.

## Setup

```
claude plugin marketplace add ekinertac/claude-code-mods
claude plugin install rewrite-prompt@ekinertac-mods
claude plugin install write-for-me@ekinertac-mods
claude plugin install prompt-box@ekinertac-mods
```

Then bind the keys. Add these to the `Global` block of `~/.claude/keybindings.json` and start a new session:

```
"ctrl+p": "app:toggleDiffNoiseFilter",
"ctrl+n": "app:toggleDiffPreSession"
```

## How the shortcut works

No keybinding action runs a mod command. The mod draws a zero-size button above the prompt whose `action` is `app:toggleDiffNoiseFilter` (inert outside the diff panel; `write-for-me` uses `app:toggleDiffPreSession` the same way, so the two never share an action), and the chord you bind to that action presses it. Nothing shows on screen.

## Limits

- Tested on Claude Code 2.1.287. Mod events and methods can change between releases.
- The rewrite replaces the draft. It keeps the intent, language and concrete details, and adds no requirements.
- Not checked in every terminal: if you see a blank row above the prompt, open an issue.
- Tests: `claude plugin test <mod>` (stubs the model, no network).
