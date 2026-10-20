import { describe, expect, it } from 'vitest'
import { BulletSession } from './BulletSession'
import { applyTranscript } from './routeTranscript'
import type { TranscriptEvent } from './TriggerDetector'

const SCRIPT = [
  '- Introduction to our company',
  '- The problem we are solving',
  '- Our proposed solution',
  '- Market opportunity',
  '- Business model',
  '- Conclusion',
].join('\n')

function final(text: string): TranscriptEvent {
  return { kind: 'final', text, coverage: 'segment' }
}

describe('BulletSession', () => {
  it('starts on the first parsed bullet', () => {
    const session = new BulletSession(SCRIPT, 'Next')
    expect(session.index).toBe(0)
    expect(session.count).toBe(6)
    expect(session.current).toBe('Introduction to our company')
    expect(session.nextBullet).toBe('The problem we are solving')
  })

  it('advances exactly one bullet per spoken trigger and stops on the last', () => {
    const session = new BulletSession(SCRIPT, 'Next')
    session.beginListening()
    expect(session.consume(final('thanks, next'))).toBe(1)
    expect(session.current).toBe('The problem we are solving')
    expect(session.consume(final('next'))).toBe(1)
    expect(session.consume(final('next'))).toBe(1)
    expect(session.consume(final('next'))).toBe(1)
    expect(session.consume(final('next'))).toBe(1)
    expect(session.index).toBe(5)
    expect(session.current).toBe('Conclusion')
    expect(session.nextBullet).toBeNull()
    expect(session.consume(final('next'))).toBe(0)
    expect(session.index).toBe(5)
  })

  it('ignores speech before start, while paused, and replays after resume', () => {
    const session = new BulletSession(SCRIPT, 'next')
    expect(session.consume(final('next'))).toBe(0)
    expect(session.index).toBe(0)

    session.beginListening()
    expect(session.consume(final('next'))).toBe(1)
    session.pause()
    expect(session.getPhase()).toBe('paused')
    expect(session.consume(final('next'))).toBe(0)
    expect(session.index).toBe(1)

    session.resume()
    expect(session.consume(final('next'))).toBe(0)
    expect(session.index).toBe(1)
    expect(session.consume(final('please go next'))).toBe(1)
    expect(session.index).toBe(2)
  })

  it('starts clean after a fresh resume so the next command still works', () => {
    const session = new BulletSession(SCRIPT, 'next')
    session.beginListening()
    session.pause()
    session.resume({ fresh: true })
    expect(session.consume(final('next'))).toBe(1)
    expect(session.index).toBe(1)
  })

  it('manual previous and next do not break the following trigger', () => {
    const session = new BulletSession(SCRIPT, 'next')
    session.beginListening()
    expect(session.prev()).toBe(false)
    expect(session.next()).toBe(true)
    expect(session.next()).toBe(true)
    expect(session.prev()).toBe(true)
    expect(session.index).toBe(1)
    expect(session.consume(final('next'))).toBe(1)
    expect(session.index).toBe(2)
  })

  it('does not walk past either end manually', () => {
    const session = new BulletSession('Only one', 'next')
    expect(session.prev()).toBe(false)
    expect(session.next()).toBe(false)
    expect(session.index).toBe(0)
  })

  it('keeps the original steps when the trigger changes and rejects an empty trigger', () => {
    const session = new BulletSession(SCRIPT, 'Next')
    expect(session.setTrigger('   ')).toBe(false)
    expect(session.setTrigger('...')).toBe(false)
    expect(session.setTrigger('moving on')).toBe(true)
    session.beginListening()
    expect(session.consume(final('next'))).toBe(0)
    expect(session.consume(final('Moving on.'))).toBe(1)
    expect(session.current).toBe('The problem we are solving')
  })

  it('clamps the cursor when the script shrinks and preserves content otherwise', () => {
    const session = new BulletSession(SCRIPT, 'Next')
    session.beginListening()
    session.consume(final('next'))
    session.consume(final('next'))
    expect(session.index).toBe(2)
    session.setScript('- Kept\n- Still here')
    expect(session.index).toBe(1)
    expect(session.current).toBe('Still here')
  })

  it('ends on the first bullet and ignores later speech until listening resumes', () => {
    const session = new BulletSession(SCRIPT, 'next')
    session.beginListening()
    session.consume(final('next'))
    session.end()
    expect(session.index).toBe(0)
    expect(session.getPhase()).toBe('idle')
    expect(session.consume(final('next'))).toBe(0)
  })

  it('routes speech to trigger detection only in bullet mode while accepting', () => {
    const session = new BulletSession(SCRIPT, 'next')
    session.beginListening()
    const event = final('next')
    expect(
      applyTranscript({ mode: 'follow', accepting: true, session, event }),
    ).toBe(0)
    expect(session.index).toBe(0)
    expect(
      applyTranscript({ mode: 'bullets', accepting: false, session, event }),
    ).toBe(0)
    expect(
      applyTranscript({ mode: 'bullets', accepting: true, session, event }),
    ).toBe(1)
    expect(session.index).toBe(1)
    expect(SCRIPT.startsWith('- Introduction')).toBe(true)
  })

  it('moves back one point for the back phrase and stays on the first', () => {
    const session = new BulletSession(SCRIPT, 'next slide', 'backwards slide')
    session.beginListening()
    expect(session.consume(final('next slide'))).toBe(1)
    expect(session.index).toBe(1)
    expect(session.consume(final('ok, backwards slide'))).toBe(1)
    expect(session.index).toBe(0)
    expect(session.consume(final('backwards slide'))).toBe(0)
    expect(session.index).toBe(0)
    expect(session.consume(final('next'))).toBe(0)
  })

  it('disarm drops recognition memory and returns to the first bullet', () => {
    const session = new BulletSession(SCRIPT, 'next')
    session.beginListening()
    session.consume(final('next'))
    session.disarm()
    expect(session.index).toBe(0)
    expect(session.getPhase()).toBe('idle')
    session.beginListening()
    expect(session.consume(final('next'))).toBe(1)
  })
})
