import { describe, expect, it } from 'vitest'
import {
  buildCaptureConstraints,
  recorderOptionsCandidates,
  RECORDER_TIMESLICE_MS,
} from './platform'

function fakeStream(width: number, height: number): MediaStream {
  return {
    getVideoTracks: () => [
      {
        getSettings: () => ({ width, height }),
      } as MediaStreamTrack,
    ],
  } as MediaStream
}

describe('sustained recording configuration', () => {
  it('caps capture at 30fps to avoid long-take encoder overload', () => {
    const constraints = buildCaptureConstraints({
      recordCamera: true,
      videoResolution: '1080p',
      facingMode: 'user',
    })
    const video = constraints.video as MediaTrackConstraints

    expect(video.frameRate).toEqual({ ideal: 30, max: 30 })
    expect(video.width).toEqual({ ideal: 1920 })
    expect(video.height).toEqual({ ideal: 1080 })
  })

  it('uses bounded bitrates and keyframes aligned to recording chunks', () => {
    const [options] = recorderOptionsCandidates(
      fakeStream(1280, 720),
      'video/webm;codecs=vp9,opus',
    )

    expect(options.mimeType).toBe('video/webm;codecs=vp9,opus')
    expect(options.audioBitsPerSecond).toBe(128_000)
    expect(options.videoBitsPerSecond).toBe(2_500_000)
    expect(options.videoKeyFrameIntervalDuration).toBe(
      RECORDER_TIMESLICE_MS,
    )
  })

  it('falls back from bounded options to mime-only and browser defaults', () => {
    const options = recorderOptionsCandidates(
      fakeStream(3840, 2160),
      'video/mp4',
    )

    expect(options).toHaveLength(3)
    expect(options[0].videoBitsPerSecond).toBe(8_000_000)
    expect(options[1]).toEqual({ mimeType: 'video/mp4' })
    expect(options[2]).toEqual({})
  })
})
