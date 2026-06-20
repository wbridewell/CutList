# Alpha Test Guide

This guide is for DMG testers only. Source-project setup lives in `docs/FIRST_RUN_ALPHA.md`.

The CutList is a local playlist-building app. You describe a playlist idea, paste a draft, or add a few known tracks, and the Curator helps shape the sequence. Tracks are only added after metadata verification.

## Who This Alpha Is For

This alpha is for someone who likes making playlists and is comfortable running a local app if the steps are clear. It is not meant for debugging source code or connecting streaming accounts.

## Fast Start

If you received the macOS app handoff instead of the source project:

1. Open `The-CutList-Alpha.dmg`.
2. Drag `The CutList.app` to `Applications`.
3. Open the app from Finder. If macOS blocks it, right-click the app, choose `Open`, then confirm the warning.
4. Click `LLM setup`.
5. Choose `Gemini (recommended)`.
6. Paste your Gemini API key.
7. Click `Save and test`.

When the app opens:

1. Click `LLM setup`.
2. Choose `Gemini (recommended)`.
3. Paste your Gemini API key.
4. Click `Save and test`.

## What To Try

- Describe a playlist idea in plain language.
- Paste a rough draft or a few seed tracks and import them.
- Ask the Curator to add, replace, tighten, reorder, or review.
- Open `Issues` if a track could not be verified.
- Save a session or export the final playlist.
- Quit and relaunch once to confirm your local draft is still there.

## What Data Stays Local, And What Leaves Your Machine

- Saved locally: your current draft, named sessions, local LLM settings, and exported files.
- Sent externally: your playlist request text goes to the LLM provider you choose, and track lookup queries go to music metadata providers during verification.
- Not uploaded: there is no Spotify upload, Apple Music upload, account system, or shared cloud workspace in this alpha.
- The packaged macOS app is meant to run on its own without the source repository or a separately installed Node runtime.

## Known Limitations

- This is a local alpha, not a polished signed app yet.
- Track verification can reject real songs when provider metadata is incomplete or ambiguous.
- API keys are stored locally for convenience, not in the OS keychain yet.
- Browser mode is not the main alpha path; the desktop app is the intended workflow.

## If Something Goes Wrong

- Your current playlist draft should stay local even if a request fails.
- If generation fails, reopen `LLM setup` and run `Save and test`.
- If verification fails, check `Issues` for reviewable matches.
- If macOS blocks the app, right-click `The CutList.app`, choose `Open`, then confirm the warning.
- If the app will not start or says the bundle is incomplete, delete the app, reinstall it from `The-CutList-Alpha.dmg`, and try again.
- If it still fails after reinstalling, report this issue on GitHub and mention that you were using the DMG build.

## How To Report Bugs

Use the in-app `Report Issue` link or open a GitHub issue with:

- what you were trying to do
- what happened instead
- whether your work was still there after the problem
- a screenshot if the UI was confusing
- whether you were using the DMG app or the source project version

## Feedback That Helps Most

- Where you got stuck on first run
- Labels or buttons that felt unclear
- Places where the Curator felt untrustworthy or too technical
- Import, issue review, save/export, and restart behavior that felt surprising
