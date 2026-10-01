import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-3 py-10">
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="text-sm text-muted">Cette page n'existe pas.</p>
      <p><Link href="/" className="text-accent underline underline-offset-2">Retour à l'état des systèmes</Link></p>
    </div>
  );
}
