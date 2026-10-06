import React from "react";
import { Maybe } from "../types/utils";

/* When the app is installed in DHIS2, the global shell renders the header bar in its own document
   and loads the app in a same-origin iframe. The header bar is therefore not part of the app
   document and clicks on it must be handled on the shell document. When the app runs standalone
   (development) it renders its own header bar and both documents are the same. */

const logoSelector = '[data-test="headerbar-logo"]';

interface HeaderLogoInterceptorOptions {
    isActive: boolean;
    onIntercept: () => void;
    onActivated?: () => void;
}

/* Navigate the outermost frame: navigating window.location would only move the iframe the shell
   uses to embed the app, leaving the user on the same screen. */
export function navigateTop(url: string): void {
    const topWindow = window.top || window;
    topWindow.location.href = url;
}

export function useHeaderLogoInterceptor(options: HeaderLogoInterceptorOptions): void {
    const { isActive, onIntercept, onActivated } = options;
    const callbacksRef = React.useRef({ onIntercept, onActivated });

    React.useEffect(() => {
        callbacksRef.current = { onIntercept, onActivated };
    }, [onIntercept, onActivated]);

    React.useEffect(() => {
        const headerDocument = getHeaderDocument();
        if (!isActive || !headerDocument) return;

        const interceptClick = (event: Event) => {
            const target = event.target;
            if (!hasClosest(target) || !target.closest(logoSelector)) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            callbacksRef.current.onIntercept();
        };

        /* Listen on the document in the capture phase: the handler then runs before any handler of
           the shell attached to the header, and does not depend on the logo being already rendered
           when this effect runs. */
        headerDocument.addEventListener("click", interceptClick, true);
        const restoreLogoLink = disableLogoLink(headerDocument);

        const notifyActivated = callbacksRef.current.onActivated;
        if (notifyActivated) notifyActivated();

        return () => {
            headerDocument.removeEventListener("click", interceptClick, true);
            restoreLogoLink();
        };
    }, [isActive]);
}

/* The shell navigates from a global click handler of its own, which runs before the handler above
   and is therefore unaffected by preventDefault/stopPropagation. Making the link transparent to
   pointer events moves the click target to the logo container, so no link is left in the event path
   for the shell to navigate to. */
function disableLogoLink(headerDocument: Document): () => void {
    const link = headerDocument.querySelector<HTMLElement>(`${logoSelector} a`);
    if (!link) return () => {};

    const pointerEvents = link.style.pointerEvents;
    link.style.pointerEvents = "none";

    return () => {
        link.style.pointerEvents = pointerEvents;
    };
}

function getHeaderDocument(): Maybe<Document> {
    try {
        return window.self === window.top ? document : window.top?.document;
    } catch (_err) {
        /* The shell document belongs to another origin, so the header cannot be intercepted. */
        return undefined;
    }
}

type ClosestTarget = { closest: (selector: string) => Element | null };

/* The clicked element belongs to the shell realm, so instanceof checks against the classes of the
   app realm (HTMLElement) always fail. Check for the method instead. */
function hasClosest(target: EventTarget | null): target is EventTarget & ClosestTarget {
    return target !== null && typeof (target as Partial<ClosestTarget>).closest === "function";
}
