"use client";

import { useEffect, useState } from "react";
// The drawer sections the workspace can jump to. Defined here, not in the component, so the
// hook layer never depends on the component layer.
export type UtilitySection = "session" | "issues" | "inputs" | "history";

export type MobileWorkspaceView = "playlist" | "ask" | "history";

export function useWorkspaceNavigation(hasPlaylistTracks: boolean) {
  const [mobileView, setMobileView] = useState<MobileWorkspaceView>(hasPlaylistTracks ? "playlist" : "ask");
  const [mobileViewTouched, setMobileViewTouched] = useState(false);
  const [requestedUtilitySection, setRequestedUtilitySection] = useState<UtilitySection | null>(null);
  const [requestedUtilitySectionToken, setRequestedUtilitySectionToken] = useState(0);

  useEffect(() => {
    if (!mobileViewTouched && hasPlaylistTracks) {
      setMobileView("playlist");
    }
  }, [hasPlaylistTracks, mobileViewTouched]);

  function chooseMobileView(view: MobileWorkspaceView) {
    setMobileViewTouched(true);
    setMobileView(view);
  }

  function requestUtilitySection(section: UtilitySection) {
    setRequestedUtilitySection(section);
    setRequestedUtilitySectionToken((current) => current + 1);
  }

  function openIssuesFromPlaylist() {
    requestUtilitySection("issues");
    setMobileViewTouched(true);
    setMobileView("ask");
  }

  return {
    chatMobileMode: mobileView === "history" ? "history" as const : "ask" as const,
    chooseMobileView,
    mobileView,
    openIssuesFromPlaylist,
    requestUtilitySection,
    requestedUtilitySection,
    requestedUtilitySectionToken
  };
}
