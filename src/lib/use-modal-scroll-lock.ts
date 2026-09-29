"use client";

import { useEffect, useLayoutEffect } from "react";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

let openModals = 0;
let scrollY = 0;
let previousStyles: { position: string; top: string; width: string; overflow: string } | null = null;

/** Freeze the page on iOS as well as desktop, without locking nested dialogs twice. */
export function useModalScrollLock() {
  useIsomorphicLayoutEffect(() => {
    if (openModals === 0) {
      scrollY = window.scrollY;
      const body = document.body;
      previousStyles = {
        position: body.style.position,
        top: body.style.top,
        width: body.style.width,
        overflow: body.style.overflow,
      };
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.width = "100%";
      body.style.overflow = "hidden";
    }
    openModals += 1;

    return () => {
      openModals -= 1;
      if (openModals === 0 && previousStyles) {
        const body = document.body;
        body.style.position = previousStyles.position;
        body.style.top = previousStyles.top;
        body.style.width = previousStyles.width;
        body.style.overflow = previousStyles.overflow;
        previousStyles = null;
        window.scrollTo(0, scrollY);
      }
    };
  }, []);
}
