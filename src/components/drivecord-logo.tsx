import { cn } from "@/lib/utils";

/**
 * Le logo de Drivecord (design KitCord, généré dans le dépôt kitcord). Une image
 * statique de 192 px : elle marche aussi dans le build statique du bureau.
 */
export function DrivecordLogo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- petit fichier statique, aussi servi par le build du bureau
  return <img src="/drivecord-192.png" alt="" aria-hidden className={cn("size-14 rounded-[22.3%]", className)} />;
}
