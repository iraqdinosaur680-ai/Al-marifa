import { useEffect, useRef } from "react";
import { App as CapApp } from "@capacitor/app";

interface BackHandlerOptions {
  activeTab: string;
  homeTab: string;
  onGoHome: () => void;
  hasOpenModal?: boolean;
  onCloseModal?: () => void;
}

export function useBackHandler({
  activeTab,
  homeTab,
  onGoHome,
  hasOpenModal = false,
  onCloseModal
}: BackHandlerOptions) {
  const handlerRef = useRef({
    activeTab,
    homeTab,
    onGoHome,
    hasOpenModal,
    onCloseModal
  });

  useEffect(() => {
    handlerRef.current = {
      activeTab,
      homeTab,
      onGoHome,
      hasOpenModal,
      onCloseModal
    };
  }, [activeTab, homeTab, onGoHome, hasOpenModal, onCloseModal]);

  // Ensure initial history state is set so back button state stack exists
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!window.history.state) {
        window.history.replaceState({ appState: "home", tab: homeTab }, "");
      }
    } catch (e) {
      console.warn("History state init issue:", e);
    }
  }, [homeTab]);

  useEffect(() => {
    let capListener: any = null;

    const handleBackAction = () => {
      const { activeTab, homeTab, onGoHome, hasOpenModal, onCloseModal } = handlerRef.current;

      if (hasOpenModal && onCloseModal) {
        console.log("[BackHandler] Intercepted back button: closing open modal/player.");
        onCloseModal();
        return true;
      }

      if (activeTab !== homeTab) {
        console.log(`[BackHandler] Intercepted back button: navigating from '${activeTab}' back to home screen '${homeTab}'.`);
        onGoHome();
        return true;
      }

      console.log("[BackHandler] Already on home screen. Intercepted back button to prevent accidental app exit.");
      return false;
    };

    // 1. Capacitor native Android back button listener
    const setupCapacitorBack = async () => {
      try {
        if (typeof window !== "undefined" && (window as any).Capacitor) {
          capListener = await CapApp.addListener("backButton", (data) => {
            handleBackAction();
          });
        }
      } catch (err) {
        console.warn("[BackHandler] Capacitor backButton listener error:", err);
      }
    };

    setupCapacitorBack();

    // 2. Standard Browser popstate listener
    const handlePopState = (event: PopStateEvent) => {
      const handled = handleBackAction();
      if (handled) {
        // Push state again so history entry is maintained for subsequent back button presses
        try {
          window.history.pushState({ appState: "stay" }, "");
        } catch (e) {}
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (capListener && typeof capListener.remove === "function") {
        capListener.remove();
      }
    };
  }, []);
}

/**
 * Helper to push a history state whenever navigating to a non-home tab or opening a modal.
 */
export function pushNavigationHistoryState(stateName: string) {
  if (typeof window === "undefined") return;
  try {
    window.history.pushState({ appState: stateName, timestamp: Date.now() }, "", `#${stateName}`);
  } catch (e) {
    console.warn("History pushState issue:", e);
  }
}
