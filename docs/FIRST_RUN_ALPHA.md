# First-Run Alpha

This is a local alpha for friendly testing. It is not a signed installer yet, and it does not connect to Spotify, Apple Music, or any streaming account.

For the full tester handoff, see [ALPHA_TEST_GUIDE.md](ALPHA_TEST_GUIDE.md).

## What You Need

- Node.js and npm
- A Gemini API key from Google AI Studio
- This project folder

## Get Node.js And npm

`npm` is installed with Node.js. If you already have Node installed, you can check from Terminal:

```bash
node --version
npm --version
```

If both commands print version numbers, you are ready.

If either command is missing, install Node.js using one of these options:

- Recommended for most testers: download the `LTS` installer from [nodejs.org](https://nodejs.org/), run it, then reopen Terminal.
- If you already use Homebrew on macOS: run `brew install node`.

After installing, run `node --version` and `npm --version` again to confirm setup worked.

## Start The App

The first time only, go to the project folder in Terminal and run:

```bash
npm run first-run
```

The first launch may install dependencies. When the app opens, use the `LLM setup` button in the top-right, choose `Gemini`, paste your Gemini API key, and click `Save and test`. You can also choose a machine-local `Curator persona` next to it if you want the Curator to sound more cutting, more historical, or more dramatic.

The key is saved only on your machine in the desktop app-data settings store.
Keep the Terminal window open while the app is running.

## Start It Later

After the first setup, open Terminal, go back to the project folder, and run:

```bash
npm run start-alpha
```

This starts the local desktop app. If it says dependencies are missing, run `npm run first-run` once from the project folder, then use `npm run start-alpha` after that.

Your Gemini setup should still be saved locally, so you should not need to paste the API key again unless you clear the app's local settings or move to a fresh copy of the project.

## What To Try

- Build a playlist from a vibe, such as `Build a 12-track playlist for a rainy late-night drive`.
- Ask for the next move, such as `The tracks were too hard to find. Keep the next pass more obvious and under 8 minutes`.
- Open `Issues` when candidates are rejected and try accepting or dismissing a reviewed match.

## What Feedback Helps

- Where did setup feel confusing?
- Did the Curator feel like a useful collaborator?
- Did rejected candidates and manual review feel trustworthy?
- Did the playlist constraints or discovery radius make sense?
- What felt too noisy, too technical, or too hidden?

## Alpha Data Handling

- Your draft, named sessions, local settings, and exports stay on your machine.
- Playlist requests are sent to the LLM provider you choose.
- Track verification queries are sent to music metadata providers.
- This alpha does not upload playlists to Spotify, Apple Music, or a CutList server.

## Known Alpha Rough Edges

- This is a local-only prototype.
- Provider verification can reject real tracks when metadata is ambiguous.
- LLM provider keys are local settings, not OS keychain entries yet.
- A polished Tauri DMG, signed build, and proper desktop settings screen are future packaging work.
