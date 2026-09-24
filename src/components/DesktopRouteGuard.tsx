import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isDesktopApp } from "@/lib/isDesktopApp";

/**
 * The desktop app is the product, not the website: landing (/) and
 * /download render outside the app shell with no navigation out, which
 * traps desktop users. Redirect them into the app instead.
 * Web builds are unaffected.
 */
export const DesktopLandingRedirect: React.FC = () => {
  const { pathname } = useLocation();
  if (isDesktopApp() && (pathname === "/" || pathname === "/download")) {
    return <Navigate to="/projects" replace />;
  }
  return null;
};
