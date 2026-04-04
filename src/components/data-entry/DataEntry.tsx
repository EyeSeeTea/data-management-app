import React, { useEffect, useState } from "react";
import moment from "moment";
import _ from "lodash";
import Spinner from "../spinner/Spinner";
import Dropdown from "../../components/dropdown/Dropdown";
import Project, { DataSet, monthFormat, getPeriodsData, DataSetType } from "../../models/Project";
import DataSetStateButton from "./DataSetStateButton";
import { useAppContext } from "../../contexts/api-context";
import i18n from "../../locales";
import { ValidationDialog } from "./ValidationDialog";
import { useValidation } from "./validation-hooks";
import { DataSetOpenInfo } from "../../models/ProjectDataSet";
import { HeaderLogoBlocker } from "../header-block/HeaderBlock";

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

const hideHeaderFooterCss = "header, footer { display: none !important; }";

function injectHideStyles(doc: Document) {
    if (doc.querySelector("style[data-dm-hide]")) return;
    const style = doc.createElement("style");
    style.setAttribute("data-dm-hide", "true");
    style.textContent = hideHeaderFooterCss;
    doc.head.appendChild(style);
}

function setEntryStyling(iframe: HTMLIFrameElement) {
    if (!iframe.contentWindow || showControls) return;

    const applyAll = () => {
        const outerDoc = iframe.contentWindow?.document;
        if (!outerDoc) return;

        injectHideStyles(outerDoc);

        outerDoc.querySelectorAll<HTMLIFrameElement>("iframe").forEach(innerIframe => {
            if (innerIframe.contentDocument) {
                injectHideStyles(innerIframe.contentDocument);
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
    const categoryId = config.categories.targetActual.id;

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
        iframeRef,
        project,
        dataSetType,
        period,
        options: validationOptions,
        iframeKey,
        isValidationEnabled: isValidationEnabled,
        disableValidation: disableValidation,
    });

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

            <HeaderLogoBlocker
                isActive={Boolean(period && dataSetInfo?.isOpen)}
                onActivated={() => setDisableValidation(true)}
                onCancelClick={async () => {
                    if (await validate({ showValidation: false })) {
                        window.location.href = baseUrl;
                    } else {
                        goBack();
                    }
                }}
            />

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
                style={isDataSetOpen || showControls ? styles.iframe : styles.iframeHidden}
                title={i18n.t("Data Entry")}
            ></iframe>
        </React.Fragment>
    );
};

const styles = {
    iframe: { width: "100%", border: 0, overflow: "hidden", minHeight: "100vh" },
    iframeHidden: { maxHeight: 0, border: 0 },
    backgroundIframe: { backgroundColor: "white" },
    selector: { padding: "35px  10px 10px 5px", backgroundColor: "white" },
    buttons: { display: "inline", marginLeft: 20 },
    dropdown: { display: "inline-block" },
};

function isOptionInSelect(select: HTMLSelectElement, value: string): boolean {
    return Array.from(select.options)
        .map(opt => opt.value)
        .includes(value);
}

function selectOption(select: HTMLSelectElement, value: string) {
    console.debug("[data-entry] selectOption", value, select.options);
    const stubEvent = new Event("stub");
    select.value = value;
    if (select.onchange) select.onchange(stubEvent);
}

/* Globals variables used to interact with the data-entry form */
interface DataEntryWindow {
    dhis2: {
        de: {
            currentPeriodOffset: number;
            storageManager: { formExists: (dataSetId: string) => boolean };
        };
        util: { on: Function };
    };
    displayPeriods: () => void;
    selection: { select: (orgUnitId: string) => void; isBusy(): boolean };
}

function setSelectPeriod(
    iframe: HTMLIFrameElement | null,
    periodKey: string | undefined,
    attributes: Attributes
): boolean {
    if (!iframe || !iframe.contentWindow) return false;

    const iframeWindow = iframe.contentWindow as Window & DataEntryWindow;
    const periodSelector =
        iframeWindow.document.querySelector<HTMLSelectElement>("#selectedPeriodId");

    if (periodSelector && periodKey) {
        const now = moment();
        const selectedDate = moment(periodKey, monthFormat);
        const iframeDocument = iframe.contentWindow.document;
        iframeWindow.dhis2.de.currentPeriodOffset = selectedDate.year() - now.year();
        try {
            iframeWindow.displayPeriods();
        } catch (err) {
            console.error("setSelectPeriod", err);
        }

        if (isOptionInSelect(periodSelector, periodKey)) {
            selectOption(periodSelector, periodKey);

            _(attributes).each((categoryOptionId, categoryId) => {
                const selector = iframeDocument.querySelector("#category-" + categoryId);
                if (!selector) {
                    console.error(`Cannot find attribute selector with categoryId=${categoryId}`);
                } else {
                    selectOption(selector as HTMLSelectElement, categoryOptionId);
                }
            });

            return true;
        } else {
            console.error("Period is not selectable", periodKey);
            return false;
        }
    } else {
        return false;
    }
}

const validationOptions = { interceptSave: true, getOnSaveEvent: true };

export default React.memo(DataEntry);
