interface PluginWindow extends Window {
    dmAutoOpenDetailsPanelInit?: boolean;
    dhis2?: { shim?: { showDetailsBar?: () => void } };
}

/* Function to eval within the legacy custom form plugin iframe of the Data Entry app. It opens the
   details panel (comment, history, audit log) whenever an entry field gets the focus, the same
   way Ctrl/Cmd+Enter does (keyPress in the plugin's form.js). If the user closes the panel, it is
   opened again on the next field focused. */
export function setupAutoOpenDetailsPanel(): void {
    const pluginWindow = window as PluginWindow;
    if (pluginWindow.dmAutoOpenDetailsPanelInit) return;

    const entryFieldSelector =
        '.entryfield, .entryselect, .entrytrueonly, .entrytime, [name="entryfield"]';

    document.addEventListener("focusin", ev => {
        const target = ev.target as Partial<Element> | null;
        if (!target || typeof target.matches !== "function") return;
        if (!target.matches(entryFieldSelector)) return;

        /* The focus handler of the plugin (valueFocus) sends the highlighted field to the Data Entry
           app. It must get there before the panel opens: the panel closes itself when no field is
           highlighted. */
        window.setTimeout(() => pluginWindow.dhis2?.shim?.showDetailsBar?.(), 0);
    });

    pluginWindow.dmAutoOpenDetailsPanelInit = true;
}
