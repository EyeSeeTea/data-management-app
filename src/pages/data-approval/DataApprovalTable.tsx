import React from "react";
import { LinearProgress } from "@material-ui/core";
// @ts-ignore
import postRobot from "@krakenjs/post-robot";
import { useBooleanState } from "../../components/utils/use-boolean";
import { useAppContext } from "../../contexts/api-context";

export interface DataApprovalTableProps {
    dataSetId: string;
    orgUnitId: string;
    period: { startDate: string; endDate: string };
    attributeOptionComboId: string;
}

export function useDhis2Url(path: string) {
    const { api, isDev } = useAppContext();
    return (isDev ? "/dhis2" : api.baseUrl) + path;
}

export const DataApprovalTable: React.FunctionComponent<DataApprovalTableProps> = props => {
    const pluginUrl = useDhis2Url("/dhis-web-approval/plugin.html");
    const iframeRef = React.useRef<HTMLIFrameElement>(null);
    const isPluginReady = useDataApprovalPlugin(iframeRef, props);

    return (
        <>
            {!isPluginReady && <LinearProgress />}

            <iframe
                src={pluginUrl}
                ref={iframeRef}
                style={styles.iframe}
                width={"100%"}
                height={500}
            />
        </>
    );
};

const styles = {
    iframe: { border: "none", overflow: "hidden" },
};

type Size = {
    width: number;
    height: number;
};

function useDataApprovalPlugin(
    iframeRef: React.RefObject<HTMLIFrameElement>,
    dataApproval: object
) {
    React.useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe || !dataApproval) return;

        const pluginProps = {
            dataApproval: dataApproval,
        };

        postRobot.send(iframe.contentWindow, "newProps", pluginProps);

        const listener = postRobot.on(
            "getProps",
            { window: iframeRef.current.contentWindow },
            () => pluginProps
        );

        return () => listener.cancel();
    }, [iframeRef, dataApproval]);

    const [isPluginReady, { enable: setPluginAsReady }] = useBooleanState(false);

    React.useEffect(() => {
        if (!iframeRef?.current) return;

        const listener = postRobot.on(
            "installationStatus",
            { window: iframeRef.current.contentWindow },
            (ev: { data: { installationStatus: "READY" | "INSTALLING" | "UNKNOWN" } }) => {
                // await navigator.serviceWorker.getRegistration() return undefined, no PWA for capture-app
                //if (ev.data.installationStatus === "READY") {
                setPluginAsReady();
                //}
            }
        );

        return () => listener.cancel();
    }, [iframeRef, setPluginAsReady]);

    return isPluginReady;
}

export default React.memo(DataApprovalTable);
