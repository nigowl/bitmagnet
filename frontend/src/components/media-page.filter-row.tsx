"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FilterOption } from "./media-page.helpers";

type FilterRowProps = {
  label: string;
  currentValue: string;
  options: FilterOption[];
  expanded: boolean;
  onToggleExpand?: () => void;
  onSelect: (value: string) => void;
};

export function FilterRow({
  label,
  currentValue,
  options,
  expanded,
  onToggleExpand,
  onSelect
}: FilterRowProps) {
  const optionsRef = useRef<HTMLDivElement | null>(null);
  const [canExpand, setCanExpand] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState(52);
  const isExpanded = expanded && canExpand;

  useLayoutEffect(() => {
    const element = optionsRef.current;
    if (!element) return;
    let frameId: number | null = null;

    const updateLayout = () => {
      const children = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
      if (children.length === 0) {
        setCanExpand(false);
        setCollapsedHeight(52);
        return;
      }

      const firstRowTop = children[0].offsetTop;
      const firstRowItems = children.filter((child) => child.offsetTop === firstRowTop);
      const firstRowBottom = Math.max(...firstRowItems.map((child) => child.offsetTop + child.offsetHeight));
      const hasOverflow = children.some((child) => child.offsetTop > firstRowTop);

      setCanExpand(hasOverflow);
      setCollapsedHeight(firstRowBottom);
    };

    const scheduleUpdate = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateLayout();
      });
    };

    scheduleUpdate();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(scheduleUpdate);
      observer.observe(element);
    } else {
      window.addEventListener("resize", scheduleUpdate, { passive: true });
    }

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      observer?.disconnect();
      if (!observer) {
        window.removeEventListener("resize", scheduleUpdate);
      }
    };
  }, [options]);

  return (
    <div
      className="media-filter-row"
      data-expandable={canExpand ? "true" : "false"}
      data-expanded={isExpanded ? "true" : "false"}
    >
      <div className="media-filter-label">{label}</div>
      <div
        ref={optionsRef}
        className={isExpanded ? "media-filter-options media-filter-options-expanded" : "media-filter-options media-filter-options-collapsed"}
        style={isExpanded ? undefined : { maxHeight: `${collapsedHeight}px` }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={currentValue === option.value ? "media-filter-pill media-filter-pill-active" : "media-filter-pill"}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {canExpand ? (
        <button
          type="button"
          className="media-filter-expand"
          onClick={onToggleExpand}
          aria-label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
        >
          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      ) : null}
    </div>
  );
}
