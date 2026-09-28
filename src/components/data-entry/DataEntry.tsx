import React, { useEffect, useState } from "react";
import moment from "moment";
import Spinner from "../spinner/Spinner";
import Dropdown from "../../components/dropdown/Dropdown";
import Project, { DataSet, monthFormat, getPeriodsData, DataSetType } from "../../models/Project";
import DataSetStateButton from "./DataSetStateButton";
import { useAppContext } from "../../contexts/api-context";
import i18n from "../../locales";
import { ValidationDialog } from "./ValidationDialog";
import { useValidation } from "./validation-hooks";
import { DataSetOpenInfo } from "../../models/ProjectDataSet";
import { navigateTop, useHeaderLogoInterceptor } from "../../utils/app-shell";
import { useFillViewportHeight } from "../../utils/use-fill-viewport-height";
import { useEvalInIframe } from "./iframe-eval";
import { setupAutoOpenDetailsPanel } from "./details-panel";

const showControls = false;

type Attributes = Record<string, string>;

interface DataEntryProps {
    orgUnitId: string;
    project: Project;
    dataSetType: DataSetType;
    dataSet: DataSet;
    attributes: Attributes;
    onValidateFnChange(validateFn: ValidateFn): void;
    goBack: () => void;
}

export type ValidateFn = { execute: () => Promise<boolean> };

interface LegacyCustomFormWindow extends Window {
    saveVal?: unknown;
    dhis2?: { shim?: unknown };
}

const pluginPollMs = 250;

/* For the footer we need to hide ONLY the last div because it contains the buttons: Run Validation, Mark as Completed.
   The other div contain the View Details button of the highlighted input field where user can enter a comment, view history values, etc
   The title of the details panel is also a header (inside the aside) and contains its close button, so it must stay visible.
 */
const hideChromeCss = [
    "header:not(aside header) { display: none !important; }",
    "footer > div > div:last-child { display: none !important; }",
].join("\n");

/* Height of the bar with the View Details button (padding, small button and border). It is only
   rendered once a field is highlighted, so its space is reserved: otherwise the form would be pushed
   down on the first click. */
const dataItemBarHeight = 37;

/* The form scrolls inside <main id="data-workspace">, so moving the footer (the bar with the View
   Details button) above it in the grid keeps the bar in sight while the user goes through the form.
   Its shadow is turned down to match its new position. */
const dataItemBarOnTopCss = [
    `div:has(> main#data-workspace) {
        grid-template-areas: "footer" "workspace" !important;
        grid-template-rows: auto minmax(0, 1fr) !important;
    }`,
    `div:has(> main#data-workspace) > footer {
        min-block-size: ${dataItemBarHeight}px;
        background-color: #ffffff;
        box-shadow: 0px 4px 6px -1px rgba(33, 41, 52, 0.1), 0px 2px 4px -1px rgba(33, 41, 52, 0.06);
    }`,
    "div:has(> main#data-workspace) > footer > div { box-shadow: none !important; }",
].join("\n");

const dataEntryCss = [hideChromeCss, dataItemBarOnTopCss].join("\n");

function injectStyles(doc: Document) {
    if (doc.querySelector("style[data-dm-styles]")) return;
    const style = doc.createElement("style");
    style.setAttribute("data-dm-styles", "true");
    style.textContent = dataEntryCss;
    doc.head.appendChild(style);
}

function setEntryStyling(iframe: HTMLIFrameElement) {
    if (!iframe.contentWindow || showControls) return;

    const applyAll = () => {
        const outerDoc = iframe.contentWindow?.document;
        if (!outerDoc) return;

        injectStyles(outerDoc);

        outerDoc.querySelectorAll<HTMLIFrameElement>("iframe").forEach(innerIframe => {
            if (innerIframe.contentDocument) {
                injectStyles(innerIframe.contentDocument);
            }
        });
    };

    applyAll();
    const intervalId = window.setInterval(applyAll, 500);

    return intervalId;
}

const DataEntry = (props: DataEntryProps) => {
    const { goBack, orgUnitId, dataSet, attributes, dataSetType, onValidateFnChange } = props;
    const { api, config, dhis2Url: baseUrl } = useAppContext();
    const [project, setProject] = useState<Project>(props.project);
    const [iframeKey, setIframeKey] = useState(new Date());
    const [isDataSetOpen, setDataSetOpen] = useState<boolean | undefined>(undefined);
    const [disableValidation, setDisableValidation] = React.useState(false);
    const { periodIds, currentPeriodId } = React.useMemo(() => getPeriodsData(dataSet), [dataSet]);
    const iframeRef = React.useRef<HTMLIFrameElement>(null);
    const iframeHeight = useFillViewportHeight(iframeRef, minIframeHeight);
    const [pluginIframe, setPluginIframe] = React.useState<HTMLIFrameElement | null>(null);
    const categoryId = config.categories.targetActual.id;

    React.useEffect(() => {
        const outer = iframeRef.current;
        if (!outer) return;

        const observers: MutationObserver[] = [];
        const loadListeners: Array<{ el: HTMLIFrameElement; fn: () => void }> = [];
        const pollIntervalIds: number[] = [];
        const tracked = new WeakSet<HTMLIFrameElement>();
        const polled = new WeakSet<HTMLIFrameElement>();
        let cancelled = false;
        let found: HTMLIFrameElement | null = null;

        /* The code evaluated in the plugin needs the scripts of the legacy form (jQuery, saveVal) and
           its shim, which the plugin loads a while after rendering the form, without any change in the
           DOM to observe. */
        const isLegacyCustomFormReady = (ifr: HTMLIFrameElement) => {
            const doc = ifr.contentDocument;
            const win = ifr.contentWindow as LegacyCustomFormWindow | null;
            if (!doc || !win) return false;

            return (
                Boolean(doc.querySelector(".plugin-legacy-custom-forms-wrapper")) &&
                typeof win.jQuery === "function" &&
                typeof win.saveVal === "function" &&
                Boolean(win.dhis2?.shim)
            );
        };

        const setFound = (ifr: HTMLIFrameElement) => {
            if (found === ifr) return;
            found = ifr;
            console.debug("[data-entry] legacy custom form plugin iframe found:", ifr);
            setPluginIframe(ifr);
        };

        const checkPluginCandidate = (ifr: HTMLIFrameElement) => {
            if (found || cancelled) return;
            if (!ifr.src.includes("plugin.html")) return;
            if (isLegacyCustomFormReady(ifr)) setFound(ifr);
        };

        const waitForPlugin = (ifr: HTMLIFrameElement) => {
            if (!ifr.src.includes("plugin.html") || polled.has(ifr)) return;
            polled.add(ifr);

            const intervalId = window.setInterval(() => {
                if (found || cancelled) {
                    window.clearInterval(intervalId);
                } else {
                    checkPluginCandidate(ifr);
                }
            }, pluginPollMs);
            pollIntervalIds.push(intervalId);
        };

        const trackIframe = (ifr: HTMLIFrameElement) => {
            if (tracked.has(ifr)) return;
            tracked.add(ifr);

            const onLoad = () => {
                checkPluginCandidate(ifr);
                waitForPlugin(ifr);

                if (ifr.contentDocument) watch(ifr.contentDocument);
            };

            if (ifr.contentDocument && ifr.contentDocument.location.href !== "about:blank") {
                onLoad();
            }

            ifr.addEventListener("load", onLoad);
            loadListeners.push({ el: ifr, fn: onLoad });
        };

        const watch = (doc: Document) => {
            if (cancelled) return;

            doc.querySelectorAll<HTMLIFrameElement>("iframe").forEach(checkPluginCandidate);

            const obs = new MutationObserver(() => {
                if (cancelled || found) return;
                doc.querySelectorAll<HTMLIFrameElement>("iframe").forEach(ifr => {
                    checkPluginCandidate(ifr);
                    trackIframe(ifr);
                });
            });
            obs.observe(doc, { childList: true, subtree: true });
            observers.push(obs);

            doc.querySelectorAll<HTMLIFrameElement>("iframe").forEach(trackIframe);
        };

        const start = () => {
            const doc = outer.contentDocument;
            if (doc) watch(doc);
        };

        outer.addEventListener("load", start);
        start();

        return () => {
            cancelled = true;
            observers.forEach(o => o.disconnect());
            pollIntervalIds.forEach(intervalId => window.clearInterval(intervalId));
            loadListeners.forEach(({ el, fn }) => el.removeEventListener("load", fn));
            outer.removeEventListener("load", start);
            setPluginIframe(null);
        };
    }, [iframeKey]);

    const categoryOptionId =
        props.dataSetType === "actual"
            ? config.categoryOptions.actual.id
            : config.categoryOptions.target.id;

    const [state, setState] = useState({
        loading: false,
        dropdownHasValues: false,
        dropdownValue: currentPeriodId,
    });

    const queryParams = `?attributeOptionComboSelection=${categoryId}-${categoryOptionId}&dataSetId=${dataSet.id}&orgUnitId=${orgUnitId}&periodId=${state.dropdownValue}`;
    const iFrameSrc = `${baseUrl}/apps/aggregate-data-entry#/${queryParams}`;

    function reloadIframe() {
        setState(state => ({ ...state, loading: true }));
        setIframeKey(new Date());
        Project.get(api, config, orgUnitId).then(setProject);
    }

    useEffect(() => {
        if (state.dropdownValue) {
            setDataSetOpen(true);
        }
    }, [state, project, iframeKey, attributes]);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const controller = new AbortController();

        if (!showControls) iframe.style.display = "none";
        setState(prevState => ({ ...prevState, loading: true }));

        iframe.addEventListener(
            "load",
            () => {
                setState(prevState => ({ ...prevState, dropdownHasValues: true }));
            },
            { signal: controller.signal }
        );

        return () => controller.abort();
    }, [iframeKey, dataSet, orgUnitId, project]);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe || showControls) return;

        let intervalId: number | undefined;

        const onLoad = () => {
            intervalId = setEntryStyling(iframe);
        };

        iframe.addEventListener("load", onLoad);

        return () => {
            iframe.removeEventListener("load", onLoad);
            window.clearInterval(intervalId);
        };
    }, [iframeKey]);

    const period = state.dropdownValue;

    const [dataSetInfo, setDataSetInfo] = React.useState<DataSetOpenInfo>();
    const projectDataSet = React.useMemo(
        () => project.getProjectDataSet(dataSet),
        [project, dataSet]
    );
    React.useEffect(() => {
        projectDataSet.getOpenInfo(moment(period, monthFormat)).then(setDataSetInfo);
    }, [projectDataSet, period]);

    const isValidationEnabled =
        Boolean(isDataSetOpen) && state.dropdownHasValues && Boolean(dataSetInfo?.isOpen);

    const validation = useValidation({
        iframe: pluginIframe,
        project,
        dataSetType,
        period,
        options: validationOptions,
        iframeKey,
        isValidationEnabled: isValidationEnabled,
        disableValidation: disableValidation,
    });

    useEvalInIframe(pluginIframe, setupAutoOpenDetailsPanel, iframeKey, undefined);

    useEffect(() => {
        const iframe = iframeRef.current;

        if (iframe && state.dropdownHasValues) {
            iframe.style.display = "";
        }
    }, [state]);

    const periodItems = React.useMemo(() => {
        return periodIds.map(periodId => ({
            text: moment(periodId, monthFormat).format("MMMM YYYY"),
            value: periodId,
        }));
    }, [periodIds]);

    const { validate } = validation;

    const setPeriod = React.useCallback(
        async value => {
            if (!(await validate({ showValidation: true }))) return;
            return setState(prevState => ({ ...prevState, dropdownValue: value }));
        },
        [setState, validate]
    );

    React.useEffect(() => {
        onValidateFnChange({
            execute: async () => !isValidationEnabled || (await validate({ showValidation: true })),
        });
    }, [isValidationEnabled, onValidateFnChange, validate]);

    const isDataSetInUse = Boolean(period && dataSetInfo?.isOpen);

    const exitFromHeaderLogo = React.useCallback(async () => {
        if (await validate({ showValidation: false })) {
            navigateTop(baseUrl);
        } else {
            goBack();
        }
    }, [baseUrl, goBack, validate]);

    const disableExitConfirmation = React.useCallback(() => setDisableValidation(true), []);

    useHeaderLogoInterceptor({
        isActive: isDataSetInUse,
        onIntercept: exitFromHeaderLogo,
        onActivated: disableExitConfirmation,
    });

    return (
        <React.Fragment>
            {period && dataSetInfo?.isOpen && (
                <ValidationDialog
                    period={period}
                    project={project}
                    dataSetType={dataSetType}
                    result={validation.result}
                    onClose={validation.clear}
                />
            )}
            <div style={styles.selector}>
                {!state.dropdownHasValues && <Spinner isLoading={state.loading} />}

                {state.dropdownHasValues && (
                    <div style={styles.dropdown}>
                        <Dropdown
                            id="month-selector"
                            items={periodItems}
                            value={state.dropdownValue}
                            onChange={setPeriod}
                            label="Period"
                            hideEmpty={true}
                        />
                    </div>
                )}

                {state.dropdownHasValues && state.dropdownValue && (
                    <div style={styles.buttons}>
                        <DataSetStateButton
                            dataSetInfo={dataSetInfo}
                            dataSetType={dataSetType}
                            project={project}
                            dataSet={dataSet}
                            period={state.dropdownValue}
                            onChange={reloadIframe}
                            validation={validation}
                        />
                    </div>
                )}
            </div>
            <iframe
                data-cy="data-entry"
                key={iframeKey.getTime()}
                height={showControls ? 1000 : undefined}
                ref={iframeRef}
                src={iFrameSrc}
                style={
                    isDataSetOpen || showControls
                        ? { ...styles.iframe, height: iframeHeight }
                        : styles.iframeHidden
                }
                title={i18n.t("Data Entry")}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            ></iframe>
        </React.Fragment>
    );
};

const styles = {
    iframe: { width: "100%", border: 0, overflow: "hidden", display: "block" },
    iframeHidden: { maxHeight: 0, border: 0 },
    backgroundIframe: { backgroundColor: "white" },
    selector: { padding: "35px  10px 10px 5px", backgroundColor: "white" },
    buttons: { display: "inline", marginLeft: 20 },
    dropdown: { display: "inline-block" },
};

const validationOptions = { interceptSave: true, getOnSaveEvent: true };

/* The iframe fills the window below the page header, so the page does not scroll and the bar with the
   View Details button stays on screen. Below this height it would be too small to enter data. */
const minIframeHeight = 480;

export default React.memo(DataEntry);
