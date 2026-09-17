import React from "react";

export interface PreSaveDataValue {
    dataElementId: string;
    optionComboId: string;
    fieldId: string;
    feedbackId: string | undefined;
    oldValue: string;
}

export interface DataValue {
    dataElementId: string;
    categoryOptionComboId: string;
    value: string;
}

interface AfterSaveDataValue {
    cc: string;
    co: string;
    cp: string;
    de: string;
    ds: string;
    ou: string;
    pe: string;
    value: string;
}

type DataValueSavedMsg = { type: "dataValueSavedFromIframe"; dataValue: AfterSaveDataValue };
type PreSaveDataValueMsg = { type: "preSaveDataValueFromIframe"; dataValue: PreSaveDataValue };

type MsgFromIframe = DataValueSavedMsg | PreSaveDataValueMsg;

export type InputMsg =
    | { type: "preSaveDataValue"; dataValue: DataValue }
    | { type: "dataValueSaved"; dataValue: DataValue };

type SaveDataValueMsg = { type: "saveDataValueToIframe"; dataValue: PreSaveDataValue };
export type OutputMsg = SaveDataValueMsg;

const inputMsgFromIframeTypes: MsgFromIframe["type"][] = [
    "dataValueSavedFromIframe",
    "preSaveDataValueFromIframe",
];

export function useDhis2EntryEvents(
    iframe: HTMLIFrameElement | null,
    onMessage: (inputMsg: InputMsg) => Promise<boolean> | undefined,
    options: Options = {},
    iframeKey: object
): void {
    const onMessageFromIframe = React.useCallback(
        async ev => {
            const iwindow = iframe && (iframe.contentWindow as DataEntryWindow);
            if (!iwindow) return;
            const { data } = ev;
            if (!isInputMsgFromIframe(data)) return;
            console.debug("|parent|<-", data);

            switch (data.type) {
                case "preSaveDataValueFromIframe": {
                    const { fieldId } = data.dataValue;
                    const value = iwindow.eval<string>(`$("#${fieldId}").val()`);
                    const dataValue: DataValue = {
                        dataElementId: data.dataValue.dataElementId,
                        categoryOptionComboId: data.dataValue.optionComboId,
                        value,
                    };

                    const inputMsg: InputMsg = { type: "preSaveDataValue", dataValue };
                    const continueSaving = await onMessage(inputMsg);

                    if (continueSaving === false) {
                        console.debug("[data-entry:preSaveDataValueFromIframe] skip save");
                        const { oldValue } = data.dataValue;
                        // Restore old value + show temporal yellow background
                        const fadeColorTimeout = 10000;
                        iwindow.eval(`
                            $("#${fieldId}").val(${JSON.stringify(oldValue)});

                            $("#${fieldId}").css({
                                backgroundColor: "#fffe8c",
                            });

                            window.setTimeout(() => {
                                $("#${fieldId}").css({
                                    backgroundColor: "#ffffff",
                                    transition: "background-color 1000ms linear",
                                });
                            }, ${fadeColorTimeout});
                        `);
                    } else {
                        const saveDataValueMsg: SaveDataValueMsg = {
                            type: "saveDataValueToIframe",
                            dataValue: data.dataValue,
                        };
                        console.debug("|parent|->", saveDataValueMsg);
                        iwindow.postMessage(saveDataValueMsg, window.location.origin);
                    }
                    break;
                }
                case "dataValueSavedFromIframe": {
                    const dv = data.dataValue;
                    const dataValue: DataValue = {
                        dataElementId: dv.de,
                        categoryOptionComboId: dv.co,
                        value: dv.value,
                    };

                    const inputMsg: InputMsg = { type: "dataValueSaved", dataValue };
                    onMessage(inputMsg);
                    break;
                }
            }
        },
        [iframe, onMessage]
    );

    React.useEffect(() => {
        const iwindow = getIframeWindow(iframe);
        if (!iwindow || !onMessage) return;

        window.addEventListener("message", onMessageFromIframe);

        return () => {
            window.removeEventListener("message", onMessageFromIframe);
        };
    }, [iframe, onMessage, options, onMessageFromIframe]);

    React.useEffect(() => {
        const iwindow = getIframeWindow(iframe);
        if (!iwindow) return;

        const inject = () => {
            const init = setupDataEntryInterceptors.toString();
            iwindow.eval(`(${init})(${JSON.stringify(options)});`);
        };

        if (iwindow.document?.readyState === "complete") {
            inject();
        } else {
            iwindow.addEventListener("load", inject, { once: true });
        }
    }, [iframe, options, iframeKey]);
}

function getIframeWindow(iframe: HTMLIFrameElement | null) {
    return iframe ? (iframe.contentWindow as DataEntryWindow) : undefined;
}

function isInputMsgFromIframe(msg: any): msg is MsgFromIframe {
    return typeof msg === "object" && inputMsgFromIframeTypes.includes(msg.type);
}

interface DataEntryWindow extends Window {
    eval<T>(code: string): T;
    dataEntryHooksInit: boolean;
    dhis2: { de: { currentExistingValue: string } };
    saveVal(
        dataElementId: string,
        optionComboId: string,
        fieldId: string,
        feedbackId: string | undefined
    ): void;
}

export interface Options {
    interceptSave?: boolean;
    getOnSaveEvent?: boolean;
}

declare global {
    interface Window {
        jQuery: any;
    }
}

/* Function to eval within the iframe to send/receive events to/from the parent page */
function setupDataEntryInterceptors(options: Options = {}) {
    const iframeWindow = window as unknown as DataEntryWindow;
    console.debug("|data-entry|:setup-interceptors", iframeWindow.dataEntryHooksInit, options);
    if (iframeWindow.dataEntryHooksInit) return;

    const postToAncestors = (msg: unknown) => {
        const targets: Window[] = [];
        let prev: Window = iframeWindow;
        let win: Window | null = iframeWindow.parent;
        while (win && win !== prev) {
            targets.push(win);
            prev = win;
            win = win.parent;
        }
        console.debug("<-|data-entry| posting to", targets.length, "ancestors", msg);
        targets.forEach(t => {
            try {
                t.postMessage(msg, window.location.origin);
            } catch (e) {
                console.debug("<-|data-entry| post failed", e);
            }
        });
    };

    if (options.getOnSaveEvent) {
        iframeWindow
            .jQuery(iframeWindow)
            .on(
                "dhis2.de.event.dataValueSaved",
                function (_ev: unknown, _dataSetId: string, dataValue: AfterSaveDataValue) {
                    const msg: DataValueSavedMsg = {
                        type: "dataValueSavedFromIframe",
                        dataValue: dataValue,
                    };
                    postToAncestors(msg);
                }
            );
    }

    const saveValOld = iframeWindow.saveVal;
    console.debug("|data-entry|:saveValOld type:", typeof saveValOld);

    if (options.interceptSave) {
        // Wrap saveVal (dhis-web-dataentry/javascript/entry.js)
        iframeWindow.saveVal = function (dataElementId, optionComboId, fieldId, feedbackId) {
            const preSaveDataValue: PreSaveDataValue = {
                dataElementId,
                optionComboId,
                fieldId,
                feedbackId,
                oldValue: iframeWindow.dhis2.de.currentExistingValue,
            };
            const msg: PreSaveDataValueMsg = {
                type: "preSaveDataValueFromIframe",
                dataValue: preSaveDataValue,
            };
            postToAncestors(msg);
        };
    }

    window.addEventListener("message", function (ev) {
        const data = ev.data as SaveDataValueMsg;
        console.debug("->|data-entry|", data);
        if (typeof data !== "object") return;

        if (data.type === "saveDataValueToIframe") {
            const { dataElementId, optionComboId, fieldId, feedbackId } = data.dataValue;
            saveValOld(dataElementId, optionComboId, fieldId, feedbackId);
        }
    });

    iframeWindow.dataEntryHooksInit = true;
}
