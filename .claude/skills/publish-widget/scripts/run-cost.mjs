#!/usr/bin/env node
// What this run cost, as commit-message trailers for the publish receipt.
// Node built-ins only — a cloud routine has no npm install.
//
//   node run-cost.mjs   →  Run-Tokens: 5487635
//                          Run-Cost-USD: 12.1518
//
// Always exits 0 and prints nothing on stdout when it can't tell. Cost is
// chrome on a receipt; a run that produced a good artifact must publish
// whether or not this could price it.
//
// **The figure is imputed, not billed.** Cloud routines run on the runner's
// Anthropic subscription (ADR-0012), where a run has no invoice — only quota.
// These are API list prices applied to the tokens the session actually spent,
// which is the honest shape of the question "what did this run cost" and is
// not a number anyone was charged. The app renders it with a ≈.

import { readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

// $ per million tokens, API list prices. Cache reads bill at 0.1× input;
// cache writes at 1.25× (5m TTL) and 2× (1h TTL). A model missing from this
// table suppresses the dollar trailer rather than under-reporting it.
const RATES = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
}

/** This session's transcript. `CLAUDE_CODE_SESSION_ID` is an ordinary env var
    and names the file; the directory is the project dir munged, so scan for
    the file rather than re-deriving that munge (dots collapse to dashes and
    worktrees nest, and a wrong guess reads as "no transcript"). */
function transcriptPath() {
  const id = process.env.CLAUDE_CODE_SESSION_ID
  if (!id || !/^[0-9a-f-]+$/i.test(id)) return null
  const root = join(homedir(), ".claude", "projects")
  let dirs
  try {
    dirs = readdirSync(root)
  } catch {
    return null // no projects dir: not a Claude Code session we can read
  }
  for (const dir of dirs) {
    const file = join(root, dir, `${id}.jsonl`)
    try {
      readFileSync(file, { flag: "r" })
      return file
    } catch {
      // not this project dir
    }
  }
  return null
}

/** Sum each assistant message's usage, per model — a run mixes them (the main
    loop and its subagents bill at different rates), so one blended total would
    be wrong for both. */
function tally(file) {
  const byModel = new Map()
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue // the transcript is written as the run goes; the last line
      // can be half-written when we read it mid-run
    }
    const usage = entry?.message?.usage
    const model = entry?.message?.model
    if (!usage || !model) continue
    const acc = byModel.get(model) ?? {
      input: 0,
      write5m: 0,
      write1h: 0,
      read: 0,
      output: 0,
    }
    acc.input += usage.input_tokens ?? 0
    acc.read += usage.cache_read_input_tokens ?? 0
    acc.output += usage.output_tokens ?? 0
    // The 5m/1h split lives only in this breakdown. The flat
    // cache_creation_input_tokens can't separate 1.25× from 2×, and on a
    // cache-heavy run that is the largest line item — pricing every write at
    // the 5m rate understated a real session here by 16%.
    acc.write5m += usage.cache_creation?.ephemeral_5m_input_tokens ?? 0
    acc.write1h += usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
    byModel.set(model, acc)
  }
  return byModel
}

const file = transcriptPath()
if (!file) {
  console.error("run-cost: no transcript for this session; no trailer")
  process.exit(0)
}

const byModel = tally(file)
let tokens = 0
let usd = 0
const unpriced = []
for (const [model, t] of byModel) {
  tokens += t.input + t.write5m + t.write1h + t.read + t.output
  const rate = RATES[model]
  if (!rate) {
    unpriced.push(model)
    continue
  }
  usd +=
    (t.input * rate.input +
      t.write5m * rate.input * 1.25 +
      t.write1h * rate.input * 2 +
      t.read * rate.input * 0.1 +
      t.output * rate.output) /
    1e6
}

if (tokens === 0) {
  console.error("run-cost: transcript carried no usage; no trailer")
  process.exit(0)
}

for (const [model, t] of byModel) {
  console.error(
    `run-cost: ${model} input=${t.input} write5m=${t.write5m} write1h=${t.write1h} read=${t.read} output=${t.output}`,
  )
}

console.log(`Run-Tokens: ${tokens}`)
if (unpriced.length > 0) {
  // Tokens are always true; a dollar figure that silently omits a model is
  // not. Report the count and let the app show tokens alone.
  console.error(`run-cost: no rate for ${unpriced.join(", ")}; tokens only`)
} else {
  console.log(`Run-Cost-USD: ${usd.toFixed(4)}`)
}
