// The app version has one source of truth, package.json: tauri.conf.json reads it from
// there, and the Rust shell passes it to the backend child process as CUTLIST_APP_VERSION
// (see desktop_command_runner in src-tauri/src/main.rs). Anything that runs outside the
// desktop shell, such as the prompt harness or unit tests, gets "dev".
type EnvLike = Record<string, string | undefined>;

export function appVersion(env: EnvLike = process.env): string {
  return env.CUTLIST_APP_VERSION?.trim() || "dev";
}

// MusicBrainz asks for a User-Agent that identifies the application, its version, and a
// way to contact the maintainer: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
export function metadataUserAgent(env: EnvLike = process.env): string {
  return `CutList/${appVersion(env)} (https://github.com/wbridewell/CutList)`;
}
