import { GenerationScreen } from "./_generation-screen";

// Avoid prerender — this page reads sessionStorage on mount.
export const dynamic = "force-dynamic";

export default function GeneratePage() {
  return <GenerationScreen />;
}
