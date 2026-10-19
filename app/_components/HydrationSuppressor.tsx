"use client";

import { useEffect } from "react";

export default function HydrationSuppressor() {
  useEffect(() => {
    const removeBis = () => {
      document.querySelectorAll("[bis_skin_checked]").forEach((el) => {
        el.removeAttribute("bis_skin_checked");
      });
    };

    removeBis();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "bis_skin_checked") {
          if (mutation.target instanceof Element) {
            mutation.target.removeAttribute("bis_skin_checked");
          }
        } else if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) {
              if (node.hasAttribute("bis_skin_checked")) {
                node.removeAttribute("bis_skin_checked");
              }
              node.querySelectorAll("[bis_skin_checked]").forEach((el) => {
                el.removeAttribute("bis_skin_checked");
              });
            }
          });
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["bis_skin_checked"],
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
