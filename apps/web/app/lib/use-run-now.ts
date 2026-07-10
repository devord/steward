import { useCallback, useEffect, useRef, useState } from "react"
import { useFetcher, useRevalidator } from "react-router"

import type { BoardScope } from "./board.ts"

/**
 * Drives one widget's "Run now" control (ADR-0012): dispatch the workflow,
 * then poll `/run` for the run it kicked off until it finishes, and refresh
 * the board so the fresh artifact + "ran just now" show. workflow_dispatch
 * returns no run id, so the server hands back the dispatch time and the poll
 * matches the run by name + created_at.
 *
 * The button is re-enabled on every terminal state — success (back to idle,
 * board revalidated), failure (clickable to retry), and cooldown (auto-clears).
 */
export type RunPhase = "idle" | "triggering" | "running" | "failed" | "cooldown"

interface TriggerResult {
  ok: boolean
  error?: string
  dispatchedAt?: number
  retryAfterSec?: number
}

interface StatusResult {
  run: { status: string | null; conclusion: string | null; url: string } | null
}

const POLL_MS = 4000
/** Give up polling after this; a run that never completes shouldn't spin forever. */
const MAX_POLL_MS = 10 * 60 * 1000

export interface RunNow {
  phase: RunPhase
  /** Seconds left on cooldown, or the failing run's URL — phase decides which. */
  note: string | null
  run: () => void
}

export function useRunNow(scope: BoardScope, slug: string): RunNow {
  const trigger = useFetcher<TriggerResult>()
  const poll = useFetcher<StatusResult>()
  const revalidator = useRevalidator()

  const [phase, setPhase] = useState<RunPhase>("idle")
  const [note, setNote] = useState<string | null>(null)
  const dispatchedAt = useRef(0)
  const startedAt = useRef(0)
  // Each fetcher response is a fresh object; track the last one handled so a
  // persisted `data` isn't re-applied on later renders (which would, e.g.,
  // bounce a finished run back to "running").
  const handledTrigger = useRef<unknown>(null)
  const handledPoll = useRef<unknown>(null)

  const run = useCallback(() => {
    setPhase("triggering")
    setNote(null)
    void trigger.submit(JSON.stringify({ scope, slug }), {
      method: "post",
      action: "/run",
      encType: "application/json",
    })
  }, [scope, slug, trigger])

  // Handle the dispatch response once it settles.
  const triggerData = trigger.data
  useEffect(() => {
    if (trigger.state !== "idle" || !triggerData) return
    if (handledTrigger.current === triggerData) return
    handledTrigger.current = triggerData
    if (triggerData.ok && triggerData.dispatchedAt) {
      dispatchedAt.current = triggerData.dispatchedAt
      startedAt.current = Date.now()
      setPhase("running")
      setNote(null)
    } else if (triggerData.error === "cooldown") {
      setPhase("cooldown")
      setNote(
        triggerData.retryAfterSec ? String(triggerData.retryAfterSec) : null,
      )
    } else {
      setPhase("failed")
      setNote(triggerData.error ?? null)
    }
  }, [trigger.state, triggerData])

  // While running, poll every POLL_MS — but never with a poll in flight, so
  // timers never stack (mirrors the device-flow poll).
  useEffect(() => {
    if (phase !== "running" || poll.state !== "idle") return
    if (Date.now() - startedAt.current > MAX_POLL_MS) {
      setPhase("failed")
      setNote(null)
      return
    }
    const id = setTimeout(() => {
      const q = new URLSearchParams({
        scope,
        slug,
        since: String(dispatchedAt.current),
      })
      void poll.load(`/run?${q}`)
    }, POLL_MS)
    return () => clearTimeout(id)
  }, [phase, poll, scope, slug])

  // Handle a poll result: finish on the run's terminal status.
  const pollData = poll.data
  useEffect(() => {
    if (phase !== "running" || poll.state !== "idle" || !pollData) return
    if (handledPoll.current === pollData) return
    handledPoll.current = pollData
    const finished = pollData.run
    if (finished?.status !== "completed") return
    if (finished.conclusion === "success") {
      setPhase("idle")
      setNote(null)
      void revalidator.revalidate()
    } else {
      setPhase("failed")
      setNote(finished.url)
    }
  }, [phase, poll.state, pollData, revalidator])

  // Cooldown clears itself so the button returns to actionable — after the
  // full server-reported wait (up to the workflow's ~5-min window), not a
  // fixed cap, or the button would re-enable while the server still 429s.
  useEffect(() => {
    if (phase !== "cooldown") return
    const secs = note ? Number(note) : 5
    const id = setTimeout(() => setPhase("idle"), Math.max(secs, 1) * 1000)
    return () => clearTimeout(id)
  }, [phase, note])

  return { phase, note, run }
}
