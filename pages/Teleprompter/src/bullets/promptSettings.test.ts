import { describe, expect, it } from 'vitest'
import { bulletMicLabel, deriveBulletMic } from './bulletMic'
import {
  parseBulletBackTrigger,
  parseBulletTrigger,
  parsePromptMode,
  phrasesMatch,
  triggerCaution,
} from './promptSettings'

describe('prompt settings', () => {
  it('preserves an unknown mode as voice follow and accepts bullet mode', () => {
    expect(parsePromptMode(undefined)).toBe('follow')
    expect(parsePromptMode('script')).toBe('follow')
    expect(parsePromptMode('bullets')).toBe('bullets')
  })

  it('rejects empty triggers and keeps a custom phrase', () => {
    expect(parseBulletTrigger('   ')).toBe('next slide')
    expect(parseBulletTrigger('...')).toBe('next slide')
    expect(parseBulletTrigger('  moving   on  ')).toBe('moving on')
    expect(parseBulletBackTrigger('')).toBe('backwards slide')
    expect(phrasesMatch('Next slide', 'next   slide')).toBe(true)
    expect(phrasesMatch('next slide', 'backwards slide')).toBe(false)
  })

  it('warns when the trigger is a common word', () => {
    expect(triggerCaution('Next')).toMatch(/common word/)
    expect(triggerCaution('moving on')).toBeNull()
  })
})

describe('deriveBulletMic', () => {
  it('reports listening only while speech recognition is actually listening', () => {
    expect(
      deriveBulletMic({
        enabled: true,
        session: 'listening',
        supervisor: 'listening',
        speech: 'listening',
      }),
    ).toBe('listening')
    expect(
      deriveBulletMic({
        enabled: true,
        session: 'listening',
        supervisor: 'listening',
        speech: 'idle',
      }),
    ).not.toBe('listening')
    expect(
      deriveBulletMic({
        enabled: true,
        session: 'listening',
        supervisor: 'recovering',
        speech: 'listening',
      }),
    ).toBe('recovering')
    expect(
      deriveBulletMic({
        enabled: true,
        session: 'listening',
        supervisor: 'suspended',
        speech: 'idle',
      }),
    ).toBe('suspended')
  })

  it('does not describe a stopped microphone as listening', () => {
    expect(bulletMicLabel('paused', 'Next')).toBe('Paused')
    expect(bulletMicLabel('off', 'Next')).toBe('Microphone off')
    expect(bulletMicLabel('recovering', 'Next')).toMatch(/Reconnecting/)
    expect(bulletMicLabel('suspended', 'Next')).toMatch(/background/)
    expect(bulletMicLabel('listening', 'Next')).toMatch(/Listening for “Next”/)
  })
})
