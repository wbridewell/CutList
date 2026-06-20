"use client";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export function isTauriApp(): boolean {
  return typeof window !== "undefined" && typeof (window as TauriWindow).__TAURI_INTERNALS__ === "object";
}

export async function getTauriCore() {
  return import("@tauri-apps/api/core");
}

export async function getTauriEvent() {
  return import("@tauri-apps/api/event");
}

export async function getTauriMenu() {
  return import("@tauri-apps/api/menu");
}
