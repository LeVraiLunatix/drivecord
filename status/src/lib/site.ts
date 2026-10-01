export const siteUrl = (): string => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://status.drivecord.app").replace(/\/+$/, "");
export const mainSiteUrl = (): string => (process.env.DRIVECORD_ORIGIN ?? "https://drivecord.app").replace(/\/+$/, "");
