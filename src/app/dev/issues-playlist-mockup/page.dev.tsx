import { IssuesPlaylistMockupClient } from "./IssuesPlaylistMockupClient";

export default function IssuesPlaylistMockupPage() {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return <IssuesPlaylistMockupClient />;
}
