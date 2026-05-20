import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isWorkspacePathAllowedOnWeb } from "@/config/platformSurface";

/** Sends web users away from desktop-only workspace routes. */
export function WebWorkspaceRouteGuard() {
  const { pathname } = useLocation();
  if (!isWorkspacePathAllowedOnWeb(pathname)) {
    return <Navigate to="/chat" replace />;
  }
  return <Outlet />;
}
