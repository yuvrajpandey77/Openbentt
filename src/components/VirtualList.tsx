import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

type VirtualListProps<T> = {
  items: T[];
  estimateSize: number;
  overscan?: number;
  className?: string;
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey: (item: T, index: number) => string;
};

/** Windowed list for long paper libraries, similarity hits, and chat threads. */
export function VirtualList<T>({
  items,
  estimateSize,
  overscan = 8,
  className,
  renderItem,
  getKey,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  return (
    <div ref={parentRef} className={className ?? "min-h-0 flex-1 overflow-y-auto"}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((vItem) => {
          const item = items[vItem.index];
          return (
            <div
              key={getKey(item, vItem.index)}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vItem.start}px)`,
              }}
              data-index={vItem.index}
              ref={virtualizer.measureElement}
            >
              {renderItem(item, vItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
