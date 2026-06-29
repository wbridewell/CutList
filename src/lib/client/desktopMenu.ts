"use client";

import { appCommandIds, dispatchAppCommand, exportCommandId, labelForCommand, type AppCommandId } from "@/lib/client/appCommands";
import { exportFormatRegistry } from "@/lib/playlist/io/exports";
import { isTauriApp } from "@/lib/client/tauriRuntime";

let setupPromise: Promise<void> | null = null;

function commandItem(id: AppCommandId, text: string, accelerator?: string) {
  return {
    id,
    text,
    accelerator,
    action: () => {
      void dispatchAppCommand(id);
    }
  };
}

export async function ensureDesktopMenu(): Promise<void> {
  if (!isTauriApp()) {
    return;
  }
  if (setupPromise) {
    return setupPromise;
  }

  setupPromise = (async () => {
    // We keep menu setup in JS because the shared command registry also lives in JS,
    // so menu clicks can reuse the exact same command IDs as the React controls.
    const { Menu, PredefinedMenuItem, Submenu } = await import("@tauri-apps/api/menu");

    const separator = () => PredefinedMenuItem.new({ item: "Separator" });
    const services = await PredefinedMenuItem.new({ item: "Services" });
    const hide = await PredefinedMenuItem.new({ item: "Hide" });
    const hideOthers = await PredefinedMenuItem.new({ item: "HideOthers" });
    const showAll = await PredefinedMenuItem.new({ item: "ShowAll" });
    const bringAllToFront = await PredefinedMenuItem.new({ item: "BringAllToFront" });
    const closeWindow = await PredefinedMenuItem.new({ item: "CloseWindow" });
    const quit = await PredefinedMenuItem.new({ item: "Quit" });
    const undo = await PredefinedMenuItem.new({ item: "Undo" });
    const redo = await PredefinedMenuItem.new({ item: "Redo" });
    const cut = await PredefinedMenuItem.new({ item: "Cut" });
    const copy = await PredefinedMenuItem.new({ item: "Copy" });
    const paste = await PredefinedMenuItem.new({ item: "Paste" });
    const selectAll = await PredefinedMenuItem.new({ item: "SelectAll" });
    const about = await PredefinedMenuItem.new({
      item: {
        About: {
          authors: ["Will Bridewell"],
          comments: "Verified playlists for weird, specific taste.",
          copyright: "Will Bridewell",
          license: "MIT",
          name: "CutList",
          version: "0.1.5",
          website: "https://github.com/wbridewell/CutList",
          websiteLabel: "GitHub"
        }
      }
    });
    const exportSubmenu = await Submenu.new({
      text: "Export Playlist",
      items: exportFormatRegistry.map((format, index) => (
        commandItem(
          exportCommandId(format.id),
          labelForCommand(exportCommandId(format.id)),
          index === 0 ? "CmdOrCtrl+Shift+E" : undefined
        )
      ))
    });

    const appMenu = await Submenu.new({
      text: "CutList",
      items: [
        about,
        await separator(),
        services,
        await separator(),
        hide,
        hideOthers,
        showAll,
        await separator(),
        bringAllToFront,
        await separator(),
        quit
      ]
    });

    const fileMenu = await Submenu.new({
      text: "File",
      items: [
        commandItem(appCommandIds.newWorkspace, labelForCommand(appCommandIds.newWorkspace), "CmdOrCtrl+N"),
        commandItem(appCommandIds.openWorkspace, labelForCommand(appCommandIds.openWorkspace), "CmdOrCtrl+O"),
        commandItem(appCommandIds.saveWorkspace, labelForCommand(appCommandIds.saveWorkspace), "CmdOrCtrl+S"),
        commandItem(appCommandIds.saveWorkspaceAs, labelForCommand(appCommandIds.saveWorkspaceAs), "CmdOrCtrl+Shift+S"),
        await separator(),
        commandItem(appCommandIds.importChat, labelForCommand(appCommandIds.importChat), "CmdOrCtrl+Shift+I"),
        exportSubmenu,
        closeWindow
      ]
    });

    const editMenu = await Submenu.new({
      text: "Edit",
      items: [undo, redo, await separator(), cut, copy, paste, selectAll]
    });

    const viewItems = [
      commandItem(appCommandIds.toggleSidebar, labelForCommand(appCommandIds.toggleSidebar), "CmdOrCtrl+\\"),
      commandItem(appCommandIds.toggleInspector, labelForCommand(appCommandIds.toggleInspector), "CmdOrCtrl+I"),
      commandItem(appCommandIds.commandPalette, labelForCommand(appCommandIds.commandPalette), "CmdOrCtrl+Shift+P")
    ];

    if (process.env.NODE_ENV === "development") {
      viewItems.push(commandItem(appCommandIds.toggleDevTools, labelForCommand(appCommandIds.toggleDevTools), "Alt+CmdOrCtrl+I"));
    }

    const viewMenu = await Submenu.new({
      text: "View",
      items: viewItems
    });

    const helpMenu = await Submenu.new({
      text: "Help",
      items: [
        commandItem(appCommandIds.showHelp, labelForCommand(appCommandIds.showHelp)),
        commandItem(appCommandIds.reportIssue, labelForCommand(appCommandIds.reportIssue)),
        await separator(),
        about
      ]
    });

    const menu = await Menu.new({
      items: [appMenu, fileMenu, editMenu, viewMenu, helpMenu]
    });
    await menu.setAsAppMenu();
  })();

  return setupPromise;
}
