"use client";

import { exportFormatRegistry } from "@/lib/playlist/io/exports";
import type { PlaylistExportFormat } from "@/lib/playlist/io/exportFormats";

export const appCommandIds = {
  changeOutputDestination: "file.changeOutputDestination",
  commandPalette: "view.commandPalette",
  exportPlaylist: "file.exportPlaylist",
  importChat: "file.importChat",
  newWorkspace: "file.newWorkspace",
  openWorkspace: "file.openWorkspace",
  revealOutput: "file.revealOutput",
  saveWorkspace: "file.saveWorkspace",
  saveWorkspaceAs: "file.saveWorkspaceAs",
  toggleInspector: "view.toggleInspector",
  toggleSidebar: "view.toggleSidebar",
  toggleDevTools: "view.toggleDevTools",
  showHelp: "help.showHelp",
  reportIssue: "help.reportIssue"
} as const;

export type ExportAppCommandId = `file.exportPlaylist.${PlaylistExportFormat}`;
export type AppCommandId = (typeof appCommandIds)[keyof typeof appCommandIds] | ExportAppCommandId;
type AppCommandHandler = () => void | Promise<void>;
type CommandNotice = { tone: "bad" | "ok"; message: string };
type CommandReporter = (notice: CommandNotice) => void;

const handlers = new Map<AppCommandId, AppCommandHandler>();

let reporter: CommandReporter | null = null;

export function exportCommandId(format: PlaylistExportFormat): ExportAppCommandId {
  return `file.exportPlaylist.${format}`;
}

function currentPlatform(): "linux" | "macos" | "windows" {
  if (typeof navigator === "undefined") {
    return "linux";
  }
  const platform = navigator.userAgent.toLowerCase();
  if (platform.includes("mac")) {
    return "macos";
  }
  if (platform.includes("win")) {
    return "windows";
  }
  return "linux";
}

export function labelForCommand(commandId: AppCommandId): string {
  if (commandId.startsWith("file.exportPlaylist.")) {
    const format = commandId.replace("file.exportPlaylist.", "") as PlaylistExportFormat;
    const definition = exportFormatRegistry.find((item) => item.id === format);
    return definition ? `Export as ${definition.label}...` : "Export Playlist...";
  }

  switch (commandId) {
    case appCommandIds.changeOutputDestination:
      return "Change Output Destination...";
    case appCommandIds.commandPalette:
      return "Command Palette...";
    case appCommandIds.exportPlaylist:
      return "Export Playlist...";
    case appCommandIds.importChat:
      return "Import Chat...";
    case appCommandIds.newWorkspace:
      return "New Workspace";
    case appCommandIds.openWorkspace:
      return "Open Workspace...";
    case appCommandIds.revealOutput:
      switch (currentPlatform()) {
        case "macos":
          return "Reveal Output in Finder";
        case "windows":
          return "Show Output in File Explorer";
        default:
          return "Show Output in Files";
      }
    case appCommandIds.saveWorkspace:
      return "Save Workspace";
    case appCommandIds.saveWorkspaceAs:
      return "Save Workspace As...";
    case appCommandIds.showHelp:
      return "CutList Help";
    case appCommandIds.reportIssue:
      return "Report Issue";
    case appCommandIds.toggleDevTools:
      return "Toggle Developer Tools";
    case appCommandIds.toggleInspector:
      return "Toggle Inspector";
    case appCommandIds.toggleSidebar:
      return "Toggle Sidebar";
    default:
      return "Command";
  }
}

function defaultErrorMessage(commandId: AppCommandId): string {
  return `${labelForCommand(commandId)} is not available right now.`;
}

function commandErrorMessage(error: unknown, commandId: AppCommandId): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return defaultErrorMessage(commandId);
}

export function setAppCommandReporter(nextReporter: CommandReporter | null): () => void {
  reporter = nextReporter;
  return () => {
    if (reporter === nextReporter) {
      reporter = null;
    }
  };
}

export function registerAppCommand(commandId: AppCommandId, handler: AppCommandHandler): () => void {
  handlers.set(commandId, handler);
  return () => {
    if (handlers.get(commandId) === handler) {
      handlers.delete(commandId);
    }
  };
}

export async function dispatchAppCommand(commandId: AppCommandId): Promise<void> {
  const handler = handlers.get(commandId);
  if (!handler) {
    reporter?.({ tone: "bad", message: defaultErrorMessage(commandId) });
    return;
  }

  try {
    await handler();
  } catch (error) {
    reporter?.({ tone: "bad", message: commandErrorMessage(error, commandId) });
  }
}
