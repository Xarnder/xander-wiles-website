import { describe, expect, it } from 'vitest'
import {
  RecognitionSupervisor,
  watchVisibility,
  type SupervisorPhase,
} from './RecognitionSupervisor'

interface FakeClock {
  now: number
  tasks: Array<{ id: number; at: number; fn: () => void }>
  nextId: number
  schedule: (fn: () => void, ms: number) => number
  cancel: (id: number) => void
  flushDue: () => void
}

function createClock(): FakeClock {
  const clock: FakeClock = {
    now: 0,
    tasks: [],
    nextId: 1,
    schedule(fn, ms) {
      const id = clock.nextId++
      clock.tasks.push({ id, at: clock.now + ms, fn })
      return id
    },
    cancel(id) {
      clock.tasks = clock.tasks.filter((task) => task.id !== id)
    },
    flushDue() {
      const due = clock.tasks
        .filter((task) => task.at <= clock.now)
        .sort((a, b) => a.at - b.at || a.id - b.id)
      clock.tasks = clock.tasks.filter((task) => task.at > clock.now)
      for (const task of due) task.fn()
    },
  }
  return clock
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('RecognitionSupervisor', () => {
  it('starts one session and does not retry a denied first start', async () => {
    const starts: number[] = []
    let stops = 0
    const clock = createClock()
    const supervisor = new RecognitionSupervisor({
      start: async () => {
        starts.push(clock.now)
        return false
      },
      stop: async () => {
        stops += 1
      },
      recoverable: () => false,
      now: () => clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    })

    await expect(supervisor.userStart()).resolves.toBe(false)
    expect(supervisor.getPhase()).toBe('unavailable')
    clock.now = 10_000
    clock.flushDue()
    expect(starts).toEqual([0])
    expect(stops).toBe(1)
    supervisor.dispose()
    expect(stops).toBe(2)
  })

  it('restarts after an unexpected stop and resets the backoff once listening is healthy', async () => {
    const clock = createClock()
    let starts = 0
    const phases: SupervisorPhase[] = []
    const supervisor = new RecognitionSupervisor({
      start: async () => {
        starts += 1
        return true
      },
      stop: async () => {},
      onPhase: (phase) => phases.push(phase),
      now: () => clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    })

    await expect(supervisor.userStart()).resolves.toBe(true)
    expect(supervisor.getPhase()).toBe('listening')

    supervisor.observe({ status: 'idle', recoverable: true })
    expect(supervisor.getPhase()).toBe('recovering')
    expect(clock.tasks).toHaveLength(1)

    clock.now = 400
    clock.flushDue()
    await Promise.resolve()
    await Promise.resolve()
    expect(starts).toBe(2)
    expect(supervisor.getPhase()).toBe('listening')

    clock.now += 2500
    supervisor.observe({ status: 'listening', recoverable: true })
    supervisor.observe({ status: 'idle', recoverable: true })
    expect(clock.tasks[0]?.at).toBe(clock.now + 400)
    expect(phases.at(-1)).toBe('recovering')
    supervisor.dispose()
    expect(clock.tasks).toHaveLength(0)
  })

  it('stops retrying after repeated recoverable failures', async () => {
    const clock = createClock()
    let starts = 0
    const supervisor = new RecognitionSupervisor({
      start: async () => {
        starts += 1
        return starts === 1
      },
      stop: async () => {},
      recoverable: () => true,
      now: () => clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
      maxFailures: 3,
    })

    await supervisor.userStart()
    supervisor.observe({ status: 'error', recoverable: true })

    for (let i = 0; i < 6; i++) {
      clock.now += 5000
      clock.flushDue()
      await Promise.resolve()
      await Promise.resolve()
    }

    expect(supervisor.getPhase()).toBe('unavailable')
    const startsAtGiveUp = starts
    clock.now += 10_000
    clock.flushDue()
    expect(starts).toBe(startsAtGiveUp)
  })

  it('does not restart a permission error and ignores a stale in-flight start', async () => {
    const clock = createClock()
    const pending = deferred<boolean>()
    let started = 0
    let stopped = 0
    const supervisor = new RecognitionSupervisor({
      start: () => {
        started += 1
        return pending.promise
      },
      stop: async () => {
        stopped += 1
      },
      now: () => clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    })

    const starting = supervisor.userStart()
    await Promise.resolve()
    expect(supervisor.getPhase()).toBe('starting')
    await supervisor.userPause()
    pending.resolve(true)
    await starting
    expect(supervisor.getPhase()).toBe('paused')
    expect(started).toBe(1)
    expect(stopped).toBeGreaterThanOrEqual(2)

    supervisor.observe({ status: 'error', recoverable: false })
    expect(clock.tasks).toHaveLength(0)
    supervisor.dispose()
  })

  it('suspends while hidden and resumes only when the tab is visible', async () => {
    const clock = createClock()
    let starts = 0
    let stops = 0
    const supervisor = new RecognitionSupervisor({
      start: async () => {
        starts += 1
        return true
      },
      stop: async () => {
        stops += 1
      },
      now: () => clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    })
    await supervisor.userStart()
    const stopsAfterStart = stops
    supervisor.setHidden(true)
    expect(supervisor.getPhase()).toBe('suspended')
    supervisor.observe({ status: 'idle', recoverable: true })
    clock.now = 5000
    clock.flushDue()
    expect(starts).toBe(1)

    supervisor.setHidden(false)
    await Promise.resolve()
    await Promise.resolve()
    expect(starts).toBe(2)
    expect(supervisor.getPhase()).toBe('listening')
    expect(stops).toBeGreaterThan(stopsAfterStart)
    supervisor.dispose()
  })

  it('removes the visibility listener on cleanup and does not restart after dispose', async () => {
    const clock = createClock()
    let starts = 0
    const listeners = new Set<() => void>()
    const doc = {
      visibilityState: 'visible' as 'visible' | 'hidden',
      addEventListener: (_type: 'visibilitychange', listener: () => void) => {
        listeners.add(listener)
      },
      removeEventListener: (_type: 'visibilitychange', listener: () => void) => {
        listeners.delete(listener)
      },
    }
    const supervisor = new RecognitionSupervisor({
      start: async () => {
        starts += 1
        return true
      },
      stop: async () => {},
      now: () => clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    })
    await supervisor.userStart()
    const unwatch = watchVisibility(supervisor, doc)
    expect(listeners.size).toBe(1)

    doc.visibilityState = 'hidden'
    for (const listener of listeners) listener()
    expect(supervisor.getPhase()).toBe('suspended')

    unwatch()
    expect(listeners.size).toBe(0)
    supervisor.dispose()
    doc.visibilityState = 'visible'
    expect(listeners.size).toBe(0)
    expect(starts).toBe(1)
    supervisor.observe({ status: 'idle', recoverable: true })
    clock.flushDue()
    expect(starts).toBe(1)
    expect(supervisor.isDisposed()).toBe(true)
  })

  it('refuses to start after dispose', async () => {
    let starts = 0
    const supervisor = new RecognitionSupervisor({
      start: async () => {
        starts += 1
        return true
      },
      stop: async () => {},
    })
    supervisor.dispose()
    await expect(supervisor.userStart()).resolves.toBe(false)
    expect(starts).toBe(0)
    expect(supervisor.getPhase()).toBe('idle')
  })
})
