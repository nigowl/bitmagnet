"use client";

import { useCallback, useEffect, useState, type RefCallback } from "react";

type TabState = "active" | "hover";

export function useTabsUnderline() {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const rootRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    setRoot(node);
  }, []);

  useEffect(() => {
    if (!root) {
      return;
    }

    const list = root.querySelector<HTMLElement>(".mantine-Tabs-list");
    if (!list) {
      return;
    }

    let tabs = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));
    if (tabs.length === 0) {
      return;
    }

    let indicator = list.querySelector<HTMLElement>(".app-tabs-inkbar");
    if (!indicator) {
      indicator = document.createElement("span");
      indicator.className = "app-tabs-inkbar";
      list.appendChild(indicator);
    }

    const activeTabElement = () => tabs.find((tab) => tab.dataset.active === "true") || tabs[0] || null;
    let activeTab = activeTabElement();

    const moveIndicator = (target: HTMLElement | null, state: TabState, instant = false) => {
      if (!target || !indicator) {
        return;
      }

      const listRect = list.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const left = targetRect.left - listRect.left + list.scrollLeft;

      if (instant) {
        indicator.classList.add("app-tabs-inkbar-instant");
      }

      indicator.style.transform = `translateX(${Math.round(left)}px)`;
      indicator.style.width = `${Math.round(targetRect.width)}px`;
      indicator.dataset.state = state;

      if (instant) {
        requestAnimationFrame(() => {
          indicator?.classList.remove("app-tabs-inkbar-instant");
        });
      }
    };

    const onMouseLeaveList = () => {
      activeTab = activeTabElement();
      moveIndicator(activeTab, "active");
    };

    const onTabMouseEnter = (event: Event) => {
      moveIndicator(event.currentTarget as HTMLElement, "hover");
    };

    const onTabFocus = (event: Event) => {
      moveIndicator(event.currentTarget as HTMLElement, "hover");
    };

    const onTabClick = () => {
      requestAnimationFrame(() => {
        activeTab = activeTabElement();
        moveIndicator(activeTab, "active");
      });
    };

    const bindTabEvents = () => {
      tabs.forEach((tab) => {
        tab.addEventListener("mouseenter", onTabMouseEnter);
        tab.addEventListener("focus", onTabFocus);
        tab.addEventListener("click", onTabClick);
      });
    };

    const unbindTabEvents = () => {
      tabs.forEach((tab) => {
        tab.removeEventListener("mouseenter", onTabMouseEnter);
        tab.removeEventListener("focus", onTabFocus);
        tab.removeEventListener("click", onTabClick);
      });
    };

    bindTabEvents();
    list.addEventListener("mouseleave", onMouseLeaveList);

    const resizeObserver = new ResizeObserver(() => {
      activeTab = activeTabElement();
      moveIndicator(activeTab, "active", true);
    });
    resizeObserver.observe(list);
    tabs.forEach((tab) => resizeObserver.observe(tab));

    const mutationObserver = new MutationObserver((mutations) => {
      let shouldRebindTabs = false;
      let activeChanged = false;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          shouldRebindTabs = true;
        }
        if (mutation.type === "attributes" && mutation.attributeName === "data-active") {
          activeChanged = true;
        }
      }

      if (shouldRebindTabs) {
        unbindTabEvents();
        tabs = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));
        bindTabEvents();
      }

      if (activeChanged || shouldRebindTabs) {
        activeTab = activeTabElement();
        moveIndicator(activeTab, "active");
      }
    });
    mutationObserver.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-active"]
    });

    moveIndicator(activeTab, "active", true);

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      list.removeEventListener("mouseleave", onMouseLeaveList);
      unbindTabEvents();
      if (indicator?.parentElement === list) {
        list.removeChild(indicator);
      }
    };
  }, [root]);

  return rootRef;
}
