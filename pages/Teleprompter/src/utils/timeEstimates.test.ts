import { describe, expect, it } from 'vitest'
import {
  calculateTimeEstimates,
  formatTimeEstimate,
} from './timeEstimates'

describe('calculateTimeEstimates', () => {
  it('returns 0 for empty scripts', () => {
    expect(calculateTimeEstimates(0, 0, 150)).toEqual({
      totalSeconds: 0,
      remainingSeconds: 0,
    })
  })

  it('returns null when wpm is not available or invalid', () => {
    expect(calculateTimeEstimates(300, 150, null)).toEqual({
      totalSeconds: null,
      remainingSeconds: null,
    })

    expect(calculateTimeEstimates(300, 150, 0)).toEqual({
      totalSeconds: null,
      remainingSeconds: null,
    })

    expect(calculateTimeEstimates(300, 150, -10)).toEqual({
      totalSeconds: null,
      remainingSeconds: null,
    })
  })

  it('returns 0 remaining seconds when script is completed even if wpm is null', () => {
    expect(calculateTimeEstimates(300, 0, null)).toEqual({
      totalSeconds: null,
      remainingSeconds: 0,
    })
  })

  it('accurately computes total and remaining times based on WPM', () => {
    // 300 words total, 150 words left, 150 WPM
    // Total: (300 / 150) * 60 = 120s
    // Remaining: (150 / 150) * 60 = 60s
    const res = calculateTimeEstimates(300, 150, 150)
    expect(res.totalSeconds).toBe(120)
    expect(res.remainingSeconds).toBe(60)
  })

  it('handles remaining words when at the start of the script', () => {
    // 120 words total, 120 words left, 120 WPM
    const res = calculateTimeEstimates(120, 120, 120)
    expect(res.totalSeconds).toBe(60)
    expect(res.remainingSeconds).toBe(60)
  })

  it('handles remaining words when near the end', () => {
    // 200 words total, 10 words left, 100 WPM
    // Total: (200 / 100) * 60 = 120s
    // Remaining: (10 / 100) * 60 = 6s
    const res = calculateTimeEstimates(200, 10, 100)
    expect(res.totalSeconds).toBe(120)
    expect(res.remainingSeconds).toBe(6)
  })
})

describe('formatTimeEstimate', () => {
  it('returns em-dash for null, negative, or non-finite values', () => {
    expect(formatTimeEstimate(null)).toBe('—')
    expect(formatTimeEstimate(-1)).toBe('—')
    expect(formatTimeEstimate(Infinity)).toBe('—')
    expect(formatTimeEstimate(NaN)).toBe('—')
  })

  it('formats under one minute as M:SS', () => {
    expect(formatTimeEstimate(0)).toBe('0:00')
    expect(formatTimeEstimate(7)).toBe('0:07')
    expect(formatTimeEstimate(45)).toBe('0:45')
    expect(formatTimeEstimate(59)).toBe('0:59')
  })

  it('formats multiple minutes as M:SS', () => {
    expect(formatTimeEstimate(60)).toBe('1:00')
    expect(formatTimeEstimate(75)).toBe('1:15')
    expect(formatTimeEstimate(125.4)).toBe('2:05')
    expect(formatTimeEstimate(600)).toBe('10:00')
    expect(formatTimeEstimate(3599)).toBe('59:59')
  })

  it('formats hours as H:MM:SS', () => {
    expect(formatTimeEstimate(3600)).toBe('1:00:00')
    expect(formatTimeEstimate(3665)).toBe('1:01:05')
    expect(formatTimeEstimate(7325)).toBe('2:02:05')
  })
})
