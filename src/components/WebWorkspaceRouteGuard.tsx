import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { isWorkspacePathAllowedOnWeb } from "@/config/platformSurface";

/** Sends web users away from desktop-only workspace routes. */
export function WebWorkspaceRouteGuard() {
  const { pathname } = useLocation();
  if (!isDesktopApp() && !isWorkspacePathAllowedOnWeb(pathname)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
