import { IssuesLabClient } from "./IssuesLabClient";

export default function IssuesLabPage() {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return <IssuesLabClient />;
}
