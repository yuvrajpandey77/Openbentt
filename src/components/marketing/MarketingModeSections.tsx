import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { overviewModes, productShots } from "@/config/marketingContent";
import { cn } from "@/lib/utils";

/**
 * Scroll-locked modes: a tall track (~100vh per mode) with a sticky viewport.
 * Wheel progress selects Notebook → Paper Orchestra → Agents → Local and
 * crossfades the screenshot. Reduced motion skips the lock and uses tabs.
 */
export function MarketingModeSections() {
  const trackRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const track = trackRef.current;
    if (!track) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = track.getBoundingClientRect();
      const scrollable = track.offsetHeight - window.innerHeight;
      if (scrollable <= 0) {
        setActiveIndex(0);
        return;
      }
      const traveled = Math.min(Math.max(-rect.top, 0), scrollable);
      const progress = traveled / scrollable;
      const next = Math.min(overviewModes.length - 1, Math.floor(progress * overviewModes.length));
      setActiveIndex((prev) => (prev === next ? prev : next));
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [reduced]);

  const active = overviewModes[activeIndex] ?? overviewModes[0];
  if (!active) return null;

  const select = (index: number) => {
    if (reduced) {
      setActiveIndex(index);
      return;
    }
    const track = trackRef.current;
    if (!track) return;
    const scrollable = track.offsetHeight - window.innerHeight;
    const start = window.scrollY + track.getBoundingClientRect().top;
    const slice = scrollable / overviewModes.length;
    window.scrollTo({ top: start + index * slice + 4, behavior: "smooth" });
  };

  return (
    <section
      id="modes"
      ref={trackRef}
      className={cn("ov-modes", reduced && "ov-modes--reduced")}
      style={{ ["--ov-mode-count" as string]: overviewModes.length }}
      aria-label="Openbentt modes"
    >
      <div className="ov-modes__sticky">
        <div className="ov-container ov-modes__grid">
          <div className="ov-modes__nav" role="tablist" aria-orientation="vertical" aria-label="Modes">
            {overviewModes.map((m, i) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={i === activeIndex}
                tabIndex={i === activeIndex ? 0 : -1}
                className={cn("ov-modes__nav-item", i === activeIndex && "ov-modes__nav-item--active")}
                onClick={() => select(i)}
              >
                {m.title}
              </button>
            ))}

            <div className="ov-modes__copy" key={active.id}>
              <h2 className="ov-modes__title font-hand">{active.title}</h2>
              <p className="ov-modes__blurb font-hand">{active.blurb}</p>
              <p className="ov-modes__body">{active.body}</p>
              <Link to={active.cta.to} className="ov-link">
                {active.cta.label} →
              </Link>
            </div>
          </div>

          <div className="ov-modes__visual" role="tabpanel" aria-label={active.title}>
            <div className="ov-window ov-window--panel">
              <div className="ov-window__chrome" aria-hidden>
                <span />
                <span />
                <span />
                <p className="ov-window__title">{active.title}</p>
              </div>
              <div className="ov-modes__stage">
                {overviewModes.map((m, i) => (
                  <img
                    key={m.id}
                    src={m.shot}
                    alt={i === activeIndex ? m.shotAlt : ""}
                    width={productShots.notebook.width}
                    height={productShots.notebook.height}
                    decoding="async"
                    className={cn("ov-modes__shot", i === activeIndex && "ov-modes__shot--active")}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
