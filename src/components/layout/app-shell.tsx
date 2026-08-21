"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AgencyHeader } from "@/components/ui/agency-header";

const FULLSCREEN_ROUTES = ["/kiosk", "/display", "/test-mode", "/bca"];

type HeaderRightContextValue = {
  setRight: (node: ReactNode) => void;
};

const HeaderRightContext = createContext<HeaderRightContextValue | null>(null);

export function useHeaderRight(node: ReactNode) {
  const ctx = useContext(HeaderRightContext);
  const nodeRef = useRef(node);
  useEffect(() => {
    nodeRef.current = node;
  });
  useEffect(() => {
    if (!ctx) return;
    ctx.setRight(nodeRef.current);
    return () => ctx.setRight(null);
  }, [ctx]);
}

function HeaderShell({ children }: { children: ReactNode }) {
  const [right, setRight] = useState<ReactNode>(null);
  const setRightStable = useCallback((node: ReactNode) => setRight(node), [setRight]);
  const value = useMemo(() => ({ setRight: setRightStable }), [setRightStable]);
  return (
    <HeaderRightContext.Provider value={value}>
      <div className="flex h-screen flex-col overflow-hidden">
        <AgencyHeader right={right} />
        <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
      </div>
    </HeaderRightContext.Provider>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isFullscreen = FULLSCREEN_ROUTES.some((route) => pathname?.startsWith(route));

  if (isFullscreen) return <>{children}</>;
  return <HeaderShell>{children}</HeaderShell>;
}
