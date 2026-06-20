import { desktopCommandNames, type DesktopWorkspaceStateResponse } from "@/lib/desktop/contracts";
import { invokeDesktopGet, invokeDesktopSave } from "@/lib/client/desktopApi";
import type { PersistedWorkspaceStateV1 } from "@/lib/playlist/io/localDraft";

export async function getDesktopWorkspaceState(): Promise<DesktopWorkspaceStateResponse> {
  return invokeDesktopGet<DesktopWorkspaceStateResponse>(desktopCommandNames.getWorkspaceState);
}

export async function saveDesktopWorkspaceState(state: PersistedWorkspaceStateV1 | null): Promise<DesktopWorkspaceStateResponse> {
  return invokeDesktopSave<DesktopWorkspaceStateResponse>(desktopCommandNames.saveWorkspaceState, { state });
}
