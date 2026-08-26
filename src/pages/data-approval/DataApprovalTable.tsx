import React from "react";
import { useAppContext } from "../../contexts/api-context";
// @ts-ignore
import { Plugin } from "@dhis2/app-runtime/build/cjs/experimental";
import { OrganisationUnit } from "../../models/Project";

export interface DataApprovalTableProps {
    dataSetId: string;
    orgUnit: OrganisationUnit;
    period: { startDate: string; endDate: string };
    attributeOptionComboId: string;
}

type Size = Readonly<{ width: number; height: number }>;

/* The plugin asks the window that embeds it for its size, but when the app is installed in DHIS2 it
   runs inside the frame of the global shell, so the request reaches the shell instead of us and the
   plugin keeps the default size of 150px with its own scrollbar. Measure the plugin document (served
   from the same origin) and give the size to the plugin, which never needs that request. */
const minHeight = 400;
/* The plugin adds the same margin to its own measurements: it prevents a scrollbar appearing when
   the measured height is rounded down. */
const heightMargin = 20;
const measureIntervalMs = 500;
const scrollingSelector = ".app-shell-app";

export function useDhis2Url(path: string) {
    const { api, isDev } = useAppContext();
    return (isDev ? "/dhis2" : api.baseUrl) + path;
}

export const DataApprovalTable: React.FunctionComponent<DataApprovalTableProps> = props => {
    const { config } = useAppContext();
    const pluginBaseUrl = useDhis2Url("/dhis-web-approval/plugin.html");
    const containerRef = React.useRef<HTMLDivElement>(null);
    const size = usePluginSize(containerRef);

    const params = {
        dataSet: props.dataSetId,
        ou: props.orgUnit.path,
        ouDisplayName: props.orgUnit.displayName,
        pe: props.period.startDate.replace(/-/g, ""),
        wf: config.dataApprovalWorkflows.project.id,
        hideSelectors: "true",
        filter: `ao:${props.attributeOptionComboId}`,
    };
    const pluginUrl = pluginBaseUrl + "#/?" + new URLSearchParams(params).toString();

    return (
        <div ref={containerRef}>
            <Plugin
                width={size.width}
                height={size.height}
                pluginSource={pluginUrl}
                showAlertsInPlugin={true}
            />
        </div>
    );
};

function usePluginSize(containerRef: React.RefObject<HTMLElement>): Size {
    const [size, setSize] = React.useState<Size>({ width: 0, height: minHeight });

    /* Measure before painting, so the plugin is not rendered with the initial empty width. */
    React.useLayoutEffect(() => {
        const measure = () => {
            const container = containerRef.current;
            if (!container) return;

            const contentHeight = getPluginContentHeight(container);

            setSize(size => {
                /* Keep the current height while the content already fits in it, so a content that
                   cannot be measured (and is therefore reported as the height of the plugin itself)
                   cannot make the plugin grow on every measurement. */
                const fits = Math.abs(size.height - contentHeight) <= heightMargin;
                const newSize = {
                    width: container.clientWidth,
                    height: fits ? size.height : Math.max(minHeight, contentHeight + heightMargin),
                };

                return size.width === newSize.width && size.height === newSize.height
                    ? size
                    : newSize;
            });
        };

        measure();

        /* The plugin renders a different report on every period/data set change, and its height also
           changes while the report loads, so measure periodically instead of on a single event. */
        const intervalId = window.setInterval(measure, measureIntervalMs);

        return () => window.clearInterval(intervalId);
    }, [containerRef]);

    return size;
}

function getPluginContentHeight(container: HTMLElement): number {
    const iframe = container.querySelector("iframe");

    try {
        const pluginDocument = iframe?.contentDocument;
        /* The plugin always fills its frame (the DHIS2 app wrapper is 100vh) and scrolls its content
           inside .app-shell-app, so measuring the document would just return the height of the frame
           itself. The first child of that scrolling element wraps the whole app and its height is the
           height of the content: it is also what DHIS2 measures to size a plugin. */
        const content = pluginDocument?.querySelector<HTMLElement>(`${scrollingSelector} > *`);
        return content?.offsetHeight || pluginDocument?.body.scrollHeight || 0;
    } catch (_err) {
        /* The plugin is served from another origin, so its content cannot be measured. */
        return 0;
    }
}

export default React.memo(DataApprovalTable);
