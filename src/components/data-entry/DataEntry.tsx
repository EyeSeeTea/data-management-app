import React, { useEffect, useState } from "react";
import moment from "moment";
import _ from "lodash";
import Spinner from "../spinner/Spinner";
//@ts-ignore
import { useConfig } from "@dhis2/app-runtime";
import Dropdown from "../../components/dropdown/Dropdown";
import { DataSet, getPeriodsData } from "../../models/Project";

const monthFormat = "YYYYMM";

type Attributes = Record<string, string>;

interface DataEntryProps {
    orgUnitId: string;
    dataSet: DataSet;
    attributes: Attributes;
}

function autoResizeIframeByContent(iframe: HTMLIFrameElement) {
    const resize = () => {
        if (iframe.contentWindow) {
            const height = iframe.contentWindow.document.body.scrollHeight;
            iframe.height = height.toString();
        }
    };
    window.setInterval(resize, 1000);
}

function on<T extends HTMLElement>(document: Document, selector: string, action: (el: T) => void) {
    const el = document.querySelector(selector) as T;
    if (el) action(el);
}

function setEntryStyling(iframe: HTMLIFrameElement) {
    if (!iframe.contentWindow) return;
    const iframeDocument = iframe.contentWindow.document;
    autoResizeIframeByContent(iframe);

    on(iframeDocument, "#currentSelection", el => el.remove());
    on(iframeDocument, "#header", el => el.remove());
    on(iframeDocument, "html", html => (html.style.overflow = "hidden"));
    on(iframeDocument, "#leftBar", el => (el.style.display = "none"));
    on(iframeDocument, "#selectionBox", el => (el.style.display = "none"));
    on(iframeDocument, "body", el => (el.style.marginTop = "-55px"));
    on(iframeDocument, "#mainPage", el => (el.style.margin = "65px 10px 10px 10px"));
    on(iframeDocument, "#completenessDiv", el => el.remove());
    on(iframeDocument, "#moduleHeader", el => el.remove());
}

function waitForOption(el: HTMLSelectElement, predicate: (option: HTMLOptionElement) => boolean) {
    return new Promise(resolve => {
        const check = () => {
            const option = _.find(el.options, predicate);
            if (option) {
                resolve();
            } else {
                setTimeout(check, 10);
            }
        };
        check();
    });
}

const setDatasetPeriodAndCategory = async (
    iframe: HTMLIFrameElement,
    dataSet: DataSet,
    attributes: Attributes,
    onDone: () => void
) => {
    if (!iframe.contentWindow) return;
    const iframeDocument = iframe.contentWindow.document;

    //get the form that we want
    const dataSetSelector = iframeDocument.querySelector<HTMLSelectElement>("#selectedDataSetId");
    const periodSelector = iframeDocument.querySelector<HTMLSelectElement>("#selectedPeriodId");
    if (!dataSetSelector || !periodSelector) return;

    // getting datasets options and select it
    await waitForOption(dataSetSelector, option => option.value === dataSet.id);
    selectOption(dataSetSelector, dataSet.id);

    // getting periodSelector options and select it
    await waitForOption(periodSelector, option => !!option.value);
    const options = periodSelector.querySelectorAll("option");
    const firstPeriodOption = options[1];
    if (firstPeriodOption) selectOption(periodSelector, firstPeriodOption.value);

    _(attributes).each((categoryOptionId, categoryId) => {
        const selector = iframeDocument.querySelector<HTMLSelectElement>("#category-" + categoryId);
        if (!selector) {
            console.error(`Cannot find attribute selector with categoryId=${categoryId}`);
            return;
        } else {
            selectOption(selector, categoryOptionId);
        }
    });

    onDone();
};

const getDataEntryForm = async (
    iframe: HTMLIFrameElement,
    dataSet: DataSet,
    orgUnitId: string,
    attributes: Attributes,
    onDone: () => void
) => {
    const contentWindow = iframe.contentWindow as (Window & DataEntryWindow) | null;
    const iframeDocument = iframe.contentDocument;
    if (!contentWindow || !iframeDocument) return;

    const iframeSelection = contentWindow.selection;
    setEntryStyling(iframe);

    contentWindow.dhis2.util.on(
        "dhis2.ou.event.orgUnitSelected",
        async (_event: unknown, organisationUnitIds: string[]) => {
            const options = iframeDocument.querySelectorAll("#selectedDataSetId option");
            if (organisationUnitIds[0] == orgUnitId && options.length > 1) {
                await setDatasetPeriodAndCategory(iframe, dataSet, attributes, onDone);
            } else {
                iframeSelection.select(orgUnitId);
            }
        }
    );
    iframeSelection.select(orgUnitId);
};

const DataEntry = (props: DataEntryProps) => {
    const { orgUnitId, dataSet, attributes } = props;
    const { periodIds, currentPeriodId } = getPeriodsData(dataSet);

    const [state, setState] = useState({
        loading: false,
        dropdownHasValues: false,
        dropdownValue: currentPeriodId,
    });

    useEffect(() => setSelectPeriod(iframeRef, state.dropdownValue), [state]);

    const { baseUrl } = useConfig();
    const iFrameSrc = `${baseUrl}/dhis-web-dataentry/index.action`;
    const iframeRef: React.RefObject<HTMLIFrameElement> = React.createRef();

    useEffect(() => {
        const iframe = iframeRef.current;

        if (iframe !== null && !state.loading) {
            iframe.style.display = "none";
            setState({ ...state, loading: true });
            iframe.addEventListener("load", () => {
                getDataEntryForm(iframe, dataSet, orgUnitId, attributes, () =>
                    setState({ ...state, dropdownHasValues: true })
                );
            });
        }
        if (iframe !== null && state.dropdownHasValues) {
            iframe.style.display = "";
        }
    }, [iframeRef, state]);

    const periodItems = periodIds.map(periodId => ({
        text: moment(periodId, monthFormat).format("MMMM YYYY"),
        value: periodId,
    }));

    return (
        <React.Fragment>
            <div style={styles.selector}>
                {!state.dropdownHasValues && <Spinner isLoading={state.loading} />}
                {state.dropdownHasValues && (
                    <Dropdown
                        items={periodItems}
                        value={state.dropdownValue}
                        onChange={value => setState({ ...state, dropdownValue: value })}
                        label="Period"
                        hideEmpty={true}
                    />
                )}{" "}
            </div>
            <iframe
                ref={iframeRef}
                src={iFrameSrc}
                style={styles.iframe}
                title={"Target Value"}
            ></iframe>
        </React.Fragment>
    );
};

const styles = {
    iframe: { width: "100%", border: 0, overflow: "hidden" },
    backgroundIframe: { backgroundColor: "white" },
    selector: { padding: "65px  10px 10px 5px", backgroundColor: "white" },
};

function selectOption(select: HTMLSelectElement, value: string) {
    const stubEvent = new Event("stub");
    select.value = value;
    if (select.onchange) select.onchange(stubEvent);
}

/* Globals variables used to interact with the data-entry form */
interface DataEntryWindow {
    dhis2: {
        de: { currentPeriodOffset: number };
        util: { on: Function };
    };
    displayPeriods: () => void;
    selection: { select: (orgUnitId: string) => void; isBusy(): boolean };
}

function setSelectPeriod(
    iframeRef: React.RefObject<HTMLIFrameElement>,
    dropdownValue: string | undefined
) {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;

    const iframeWindow = iframe.contentWindow as (Window & DataEntryWindow);
    const periodSelector = iframeWindow.document.querySelector("#selectedPeriodId");

    if (periodSelector && dropdownValue) {
        const now = moment();
        const selectedDate = moment(dropdownValue, monthFormat);
        iframeWindow.dhis2.de.currentPeriodOffset = selectedDate.year() - now.year();
        iframeWindow.displayPeriods();
        selectOption(periodSelector as HTMLSelectElement, dropdownValue);
    }
}

export default DataEntry;
