import React from "react";

export interface PageMetrics {
    viewportHeight: number;
    documentHeight: number;
    elementTop: number;
    elementHeight: number;
}

export interface FillViewportHeight {
    height: number;
    spaceBelow: number;
}

/* Height that makes an element end at the bottom of the window, keeping visible what the page
   renders below it (margins). That space can only be measured while the page overflows the window:
   otherwise the document is as tall as the window and the gap below the element is just empty
   viewport, so the last space measured is kept. */
export function getFillViewportHeight(
    metrics: Readonly<PageMetrics>,
    lastSpaceBelow: number,
    minHeight: number
): FillViewportHeight {
    const { viewportHeight, documentHeight, elementTop, elementHeight } = metrics;
    const overflows = documentHeight > viewportHeight;
    const spaceBelow = overflows ? documentHeight - (elementTop + elementHeight) : lastSpaceBelow;
    const height = Math.max(minHeight, Math.floor(viewportHeight - elementTop - spaceBelow));

    return { height, spaceBelow };
}

/* The page then does not scroll, so the top and the bottom of the element never leave the screen. */
export function useFillViewportHeight(
    ref: React.RefObject<HTMLElement>,
    minHeight: number
): number | undefined {
    const [height, setHeight] = React.useState<number>();
    const spaceBelowRef = React.useRef(0);

    React.useEffect(() => {
        const measure = () => {
            const element = ref.current;
            if (!element) return;

            const metrics: PageMetrics = {
                viewportHeight: window.innerHeight,
                documentHeight: document.documentElement.scrollHeight,
                elementTop: element.getBoundingClientRect().top + window.scrollY,
                elementHeight: element.offsetHeight,
            };
            const fill = getFillViewportHeight(metrics, spaceBelowRef.current, minHeight);
            spaceBelowRef.current = fill.spaceBelow;
            setHeight(fill.height);
        };

        measure();
        window.addEventListener("resize", measure);

        /* The content above the element changes after the first render (i.e. selectors shown once
           loaded). Setting the height resizes the body again, but the next measure returns the same
           height, as the top of the element does not depend on it. */
        const observer = new ResizeObserver(measure);
        observer.observe(document.body);

        return () => {
            window.removeEventListener("resize", measure);
            observer.disconnect();
        };
    }, [ref, minHeight]);

    return height;
}
