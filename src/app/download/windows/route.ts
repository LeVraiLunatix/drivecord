/**
 * GET /download/windows — stable link to the latest Windows installer.
 *
 * Redirects to the `latest` GitHub release asset of `drivecord-desktop`, so the
 * link on the site never changes when a new version ships. The asset is
 * uploaded under a fixed name (`Drivecord-Setup-x64.exe`).
 */
import { NextResponse } from "next/server";

const INSTALLER =
  "https://github.com/LeVraiLunatix/drivecord-desktop/releases/latest/download/Drivecord-Setup-x64.exe";

export function GET() {
  return NextResponse.redirect(INSTALLER, 302);
}
