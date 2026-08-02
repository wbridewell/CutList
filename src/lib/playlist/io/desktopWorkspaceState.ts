import "server-only";

import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { writeFileAtomicSync } from "@/lib/desktop/atomicFile";
import {
  parsePersistedWorkspaceState,
  serializePersistedWorkspaceState,
  type PersistedWorkspaceStateV1
} from "@/lib/playlist/io/localDraft";

const DESKTOP_WORKSPACE_STATE_FILE = "workspace-state.json";

function workspaceStatePath(): string {
  const explicitPath = process.env.CUTLIST_DESKTOP_WORKSPACE_STATE_PATH;
  if (explicitPath) {
    return resolve(process.cwd(), explicitPath);
  }
  const desktopDataDir = process.env.CUTLIST_DESKTOP_DATA_DIR?.trim();
  if (desktopDataDir) {
    return resolve(desktopDataDir, DESKTOP_WORKSPACE_STATE_FILE);
  }
  return resolve(process.cwd(), DESKTOP_WORKSPACE_STATE_FILE);
}

export function writeDesktopWorkspaceState(state: PersistedWorkspaceStateV1 | null): PersistedWorkspaceStateV1 | null {
  const path = workspaceStatePath();
  const normalized = state ? parsePersistedWorkspaceState(serializePersistedWorkspaceState(state)) : null;
  if (!normalized) {
    rmSync(path, { force: true });
    return null;
  }

  writeFileAtomicSync(path, serializePersistedWorkspaceState(normalized));
  return normalized;
}
