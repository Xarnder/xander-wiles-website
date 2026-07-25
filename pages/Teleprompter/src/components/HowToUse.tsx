interface HowToUseProps {
  onClose: () => void
}

export function HowToUse({ onClose }: HowToUseProps) {
  return (
    <section className="howto-page glass-panel" aria-labelledby="howto-title">
      <div className="panel-header">
        <h2 id="howto-title">How to use</h2>
        <button type="button" className="btn ghost" onClick={onClose}>
          Done
        </button>
      </div>

      <div className="howto-body">
        <p className="howto-lead">
          Voice Follow is an on-device teleprompter. It listens to your microphone,
          matches what you say to your script, and scrolls automatically — no cloud
          speech API, and it works offline after the model loads once.
        </p>

        <h3>Quick start</h3>
        <ol className="howto-steps">
          <li>
            Press <strong>Edit</strong>, paste or type your script (or import a
            <code>.txt</code> file), then press <strong>Done</strong>.
          </li>
          <li>
            Optionally open <strong>Settings</strong> to pick a mic, font size,
            line width, dark/light mode, or mirror mode for a beam-splitter rig.
          </li>
          <li>
            Press <strong>Start</strong> and allow microphone access. The first
            run downloads the speech model (cached afterward).
          </li>
          <li>
            Read the highlighted word aloud at a natural pace. The script scrolls
            with you.
          </li>
          <li>
            Press <strong>Pause</strong> to stop listening, or <strong>Reset</strong>{' '}
            to jump back to the beginning.
          </li>
        </ol>

        <h3>How it works</h3>
        <div className="howto-flow" aria-hidden>
          <div className="howto-flow-step">
            <span className="howto-flow-num">1</span>
            <strong>Mic</strong>
            <p>Audio stays in your browser</p>
          </div>
          <span className="howto-flow-arrow">→</span>
          <div className="howto-flow-step">
            <span className="howto-flow-num">2</span>
            <strong>Speech</strong>
            <p>On-device Moonshine ASR</p>
          </div>
          <span className="howto-flow-arrow">→</span>
          <div className="howto-flow-step">
            <span className="howto-flow-num">3</span>
            <strong>Match</strong>
            <p>Aligns words to the script</p>
          </div>
          <span className="howto-flow-arrow">→</span>
          <div className="howto-flow-step">
            <span className="howto-flow-num">4</span>
            <strong>Scroll</strong>
            <p>Smooth pace-aware motion</p>
          </div>
        </div>
        <ul className="howto-list">
          <li>
            <strong>Live scroll</strong> means speech matches the script near your
            current place — scrolling follows you.
          </li>
          <li>
            <strong>Paused — off script</strong> means you ad-libbed or drifted.
            Scroll freezes until you return to the text.
          </li>
          <li>
            While paused (or off script), you can scroll manually. Auto-scroll
            only locks in live mode.
          </li>
        </ul>

        <h3>Reading tips</h3>
        <ul className="howto-list">
          <li>Speak the script words — not a paraphrase — for best tracking.</li>
          <li>
            Pause mid-sentence: scroll holds, then continues when you resume.
          </li>
          <li>
            Skip ahead a paragraph on purpose: keep reading from the new spot and
            it should re-sync.
          </li>
          <li>
            Repeat a line if you stumble: short backtracks are fine; re-reading
            about five earlier words can rewind to that sentence (turn off{' '}
            <strong>Jump back mode</strong> in Settings if you prefer the cursor
            never move backward).
          </li>
          <li>
            Common words like “the” / “a” alone won’t yank you down the page —
            distinctive words keep alignment stable.
          </li>
        </ul>

        <h3>Useful settings</h3>
        <ul className="howto-list">
          <li>
            <strong>Match confidence</strong> — higher = stricter matching (fewer
            false jumps); lower = more forgiving.
          </li>
          <li>
            <strong>Scroll sensitivity</strong> — how eagerly the view catches up
            to your position.
          </li>
          <li>
            <strong>Cursor position</strong> — keep the live word at the top, in
            the middle, or hybrid (starts at the top, then locks to the middle
            once you reach it).
          </li>
          <li>
            <strong>Jump back mode</strong> — when on, re-speaking earlier text
            can rewind the cursor; when off, matching only looks ahead from your
            current place.
          </li>
          <li>
            <strong>Keep line &amp; paragraph breaks</strong> — preserve blank
            lines from your original script in the display.
          </li>
          <li>
            <strong>After each full stop (.)</strong> — even with original breaks
            off, insert a tab-sized gap or a line break after every period.
          </li>
          <li>
            <strong>Cursor lead</strong> — highlight a few words ahead of what
            the mic just matched, so your eye stays in front of your speech.
          </li>
          <li>
            <strong>Highlight cursor</strong> — turn off the current-word glow
            entirely (scroll still follows your speech).
          </li>
          <li>
            <strong>Mirror mode</strong> — flip the text for physical teleprompter
            glass.
          </li>
          <li>
            <strong>Preload model</strong> — download the speech model before you
            go on camera.
          </li>
        </ul>

        <h3>Privacy</h3>
        <p>
          Speech recognition runs entirely on your device. Nothing is uploaded to
          a speech API. After the first model download, you can use the app
          offline.
        </p>
      </div>
    </section>
  )
}
