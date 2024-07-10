import React from "react";
import { useAppContext } from "../../contexts/api-context";
// @ts-ignore
import { Plugin } from "@dhis2/app-runtime/build/cjs/experimental";

export interface DataApprovalTableProps {
    dataSetId: string;
    //orgUnit: NamedRef;
    orgUnitId: string;
    period: { startDate: string; endDate: string };
    attributeOptionComboId: string;
}

export function useDhis2Url(path: string) {
    const { api, isDev } = useAppContext();
    return (isDev ? "/dhis2" : api.baseUrl) + path;
}

export const DataApprovalTable: React.FunctionComponent<DataApprovalTableProps> = props => {
    const pluginBaseUrl = useDhis2Url("/dhis-web-approval/plugin.html");
    const params = {
        dataSet: "uQ6xLjyXjI1",
        ou: "/AGZEUf9meZ6/aqWKqMN5pUb/BYGtHgVKWLY",
        ouDisplayName: "2023-2025 SHINE",
        pe: "202406",
        wf: "CCy0oNyvlV1",
    };
    const pluginUrl = pluginBaseUrl + "#/?" + new URLSearchParams(params).toString();
    const iframeRef = React.useRef<HTMLIFrameElement>(null);

    return (
        <Plugin
            pluginSource={pluginBaseUrl}
            onError={(err: any) => {
                console.error("ERROR", err);
            }}
            showAlertsInPlugin={true}
            propToPass={"42"}
        />
    );
};

const styles = {
    iframe: { border: "none", overflow: "hidden" },
};

export default React.memo(DataApprovalTable);
