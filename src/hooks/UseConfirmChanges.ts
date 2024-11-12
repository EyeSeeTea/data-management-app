import React from "react";

type ProceedWarning = { type: "hidden" } | { type: "visible"; action: () => void };

export function useConfirmChanges() {
    const [proceedWarning, setProceedWarning] = React.useState<ProceedWarning>({ type: "hidden" });
    const [wasReportModified, wasReportModifiedSet] = React.useState(false);

    const confirmIfUnsavedChanges = React.useCallback(
        (action: () => void) => {
            if (wasReportModified) {
                setProceedWarning({ type: "visible", action });
            } else {
                action();
            }
        },
        [wasReportModified, setProceedWarning]
    );

    const runProceedAction = React.useCallback(
        (action: () => void) => {
            setProceedWarning({ type: "hidden" });
            action();
        },
        [setProceedWarning]
    );

    return {
        confirmIfUnsavedChanges,
        proceedWarning,
        runProceedAction,
        wasReportModified,
        wasReportModifiedSet,
    };
}
