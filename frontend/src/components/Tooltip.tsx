import { useState, useRef, useEffect } from "react";
import { HelpCircle, ExternalLink } from "lucide-react";
import clsx from "clsx";

/**
 * Convert a CGI reference like "CGI art. 39 C" into a Légifrance search URL.
 */
function cgiRefUrl(cgiRef: string): string {
  const article = cgiRef.replace(/^CGI\s+art\.\s*/i, "article ");
  return `https://www.legifrance.gouv.fr/search/all?query=${encodeURIComponent(article + " code général des impôts")}&tab_selection=code`;
}

interface TooltipProps {
  content: string;
  cgiRef?: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export function Tooltip({ content, cgiRef, side = "top", className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(true);
  };

  // 300ms grace period — lets the mouse cross the gap between icon and tooltip bubble
  const scheduleHide = () => {
    hideTimer.current = setTimeout(() => setVisible(false), 300);
  };

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div
      ref={wrapperRef}
      className={clsx("relative inline-flex items-center", className)}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onClick={() => setVisible((v) => !v)}
    >
      <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-primary-500 cursor-help transition-colors" />

      {visible && (
        <div
          className={clsx(
            "absolute z-50 w-72 bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5 shadow-xl",
            positionClasses[side]
          )}
          // Explicitly cancel hide when mouse enters the popup — covers the absolute gap
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
          // Stop click propagation so clicking inside the tooltip doesn't toggle it
          onClick={(e) => e.stopPropagation()}
        >
          <p className="leading-relaxed select-text">{content}</p>
          {cgiRef && (
            <a
              href={cgiRefUrl(cgiRef)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 pt-2 border-t border-gray-700 flex items-center gap-1.5 text-blue-300 hover:text-blue-100 hover:underline transition-colors"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              {cgiRef} — consulter sur Légifrance
            </a>
          )}
          {/* Arrow */}
          <div
            className={clsx("absolute w-2 h-2 bg-gray-900 rotate-45", {
              "top-full left-1/2 -translate-x-1/2 -translate-y-1": side === "top",
              "bottom-full left-1/2 -translate-x-1/2 translate-y-1": side === "bottom",
              "top-1/2 right-0 -translate-y-1/2 translate-x-1": side === "left",
              "top-1/2 left-0 -translate-y-1/2 -translate-x-1": side === "right",
            })}
          />
        </div>
      )}
    </div>
  );
}

interface LabelWithTooltipProps {
  label: string;
  tooltip: string;
  cgiRef?: string;
  required?: boolean;
  side?: "top" | "bottom" | "left" | "right";
}

export function LabelWithTooltip({ label, tooltip, cgiRef, required, side }: LabelWithTooltipProps) {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <Tooltip content={tooltip} cgiRef={cgiRef} side={side} />
    </div>
  );
}
