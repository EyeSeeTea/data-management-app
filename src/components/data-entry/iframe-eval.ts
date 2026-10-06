import React from "react";

interface EvalWindow extends Window {
    eval(code: string): unknown;
}

/* Run `fn` inside a same-origin iframe once its document is loaded. `fn` is serialized with
   toString(), so it must be self-contained: no imports or variables from this module. */
export function useEvalInIframe<Args>(
    iframe: HTMLIFrameElement | null,
    fn: (args: Args) => void,
    iframeKey: object,
    args: Args
): void {
    React.useEffect(() => {
        const iwindow = iframe?.contentWindow as EvalWindow | null | undefined;
        if (!iwindow) return;

        /* The code runs against scripts of another app: if it fails, log it instead of letting the
           error unmount this whole app. */
        const inject = () => {
            try {
                iwindow.eval(`(${fn.toString()})(${JSON.stringify(args)});`);
            } catch (err) {
                console.error("[data-entry] could not run code in the data entry iframe", err);
            }
        };

        if (iwindow.document?.readyState === "complete") {
            inject();
        } else {
            iwindow.addEventListener("load", inject, { once: true });
        }
    }, [iframe, fn, args, iframeKey]);
}
