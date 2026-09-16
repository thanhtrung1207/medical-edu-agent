"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Drawer } from "./Drawer";
import { Footer } from "./Footer";

/**
 * Client shell that owns the navigation drawer state. The hamburger (Header,
 * below md) and the rail expand button (Sidebar, md to below lg) both funnel
 * through here; the server layout stays free of client state.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Remembers the button that opened the drawer so focus returns to it on
  // close (WAI-ARIA dialog pattern).
  const drawerInvokerRef = useRef<HTMLButtonElement | null>(null);

  const openDrawer = useCallback(() => {
    drawerInvokerRef.current =
      document.activeElement as HTMLButtonElement | null;
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    drawerInvokerRef.current?.focus();
    drawerInvokerRef.current = null;
  }, []);

  const toggleDrawer = useCallback(() => {
    if (drawerOpen) closeDrawer();
    else openDrawer();
  }, [drawerOpen, closeDrawer, openDrawer]);

  // Auto-dismiss the drawer when the viewport reaches lg (1024px), where the
  // full sidebar takes over navigation. No focus restoration here: both
  // invoker buttons are hidden at lg.
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setDrawerOpen(false);
        drawerInvokerRef.current = null;
      }
    };
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return (
    <>
      <Sidebar onExpandDrawer={openDrawer} drawerOpen={drawerOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onToggleDrawer={toggleDrawer} drawerOpen={drawerOpen} />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
        <Footer />
      </div>
      <Drawer open={drawerOpen} onClose={closeDrawer} />
    </>
  );
}
