export function WelcomeGuide() {
  return (
    <details className="welcome-guide">
      <summary>
        <span>Start here</span>
        <strong>How The CutList works</strong>
      </summary>
      <div className="welcome-copy">
        <h2 id="welcome-guide-title">Build a verified playlist with a curator at your side.</h2>
        <p>
          Start by describing the playlist you want, then add known tracks or constraints if needed. The CutList only adds tracks after metadata verification,
          then keeps the notes, fit, and conversation history together.
        </p>
      </div>
      <div className="welcome-steps" aria-label="Ways to begin">
        <div>
          <strong>1. Describe the playlist</strong>
          <span>Try “make a tense 45-minute road trip playlist” or use one of the suggested moves below.</span>
        </div>
        <div>
          <strong>2. Add known tracks if needed</strong>
          <span>Paste known tracks or an old draft when you already have a few anchors. The app verifies each track before adding it.</span>
        </div>
        <div>
          <strong>3. Review and repair</strong>
          <span>Open Issues to fix rejected matches, then review the flow, save sessions, or export the finished playlist.</span>
        </div>
      </div>
    </details>
  );
}
