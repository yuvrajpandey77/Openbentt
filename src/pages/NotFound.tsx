import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { appHomePath } from "@/lib/appHomePath";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="mb-2 font-display text-4xl font-bold text-foreground">404</h1>
        <p className="mb-6 text-lg text-muted-foreground">That page does not exist.</p>
        <div className="flex flex-col items-center gap-2 text-sm">
          <Link to={appHomePath()} className="font-medium text-primary underline-offset-4 hover:underline">
            Back to home
          </Link>
          {appHomePath() === "/" && (
            <Link to="/chat" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Open chat
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotFound;
