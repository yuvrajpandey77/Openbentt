import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useOnboarding } from "@/context/OnboardingContext";
import { isDesktopApp } from "@/lib/isDesktopApp";

/**
 * The desktop app is the product, not the website: landing (/) and
 * /download render outside the app shell with no navigation out, which
 * traps desktop users. Redirect them into onboarding or the app instead.
 * Web builds are unaffected.
 */
export const DesktopLandingRedirect: React.FC = () => {
  const { pathname } = useLocation();
  const { needsOnboarding } = useOnboarding();
  if (isDesktopApp() && (pathname === "/" || pathname === "/download")) {
    return <Navigate to={needsOnboarding ? "/welcome" : "/chat"} replace />;
  }
  return null;
};
