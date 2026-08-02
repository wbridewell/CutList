import {
  desktopCommandNames,
  type DesktopQuarantineWorkspaceStateResult,
  type DesktopWorkspaceStateReadResult,
  type DesktopWorkspaceStateResponse
} from "@/lib/desktop/contracts";
import { invokeDesktopGet, invokeDesktopQuarantineWorkspaceState, invokeDesktopSave } from "@/lib/client/desktopApi";
import type { PersistedWorkspaceStateV1 } from "@/lib/playlist/io/localDraft";

export async function getDesktopWorkspaceState(): Promise<DesktopWorkspaceStateReadResult> {
  return invokeDesktopGet<DesktopWorkspaceStateReadResult>(desktopCommandNames.getWorkspaceState);
}

export async function quarantineDesktopWorkspaceState(): Promise<DesktopQuarantineWorkspaceStateResult> {
  return invokeDesktopQuarantineWorkspaceState();
}

export async function saveDesktopWorkspaceState(state: PersistedWorkspaceStateV1 | null): Promise<DesktopWorkspaceStateResponse> {
  return invokeDesktopSave<DesktopWorkspaceStateResponse>(desktopCommandNames.saveWorkspaceState, { state });
}
