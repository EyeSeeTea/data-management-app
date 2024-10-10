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

export function useDhis2Url(path: string) {
    const { api, isDev } = useAppContext();
    return (isDev ? "/dhis2" : api.baseUrl) + path;
}

export const DataApprovalTable: React.FunctionComponent<DataApprovalTableProps> = props => {
    const { config } = useAppContext();
    const pluginBaseUrl = useDhis2Url("/dhis-web-approval/plugin.html");

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

    return <Plugin width="1000" pluginSource={pluginUrl} showAlertsInPlugin={true} />;
};

const styles = {
    iframe: { border: "none", overflow: "hidden" },
};

export default React.memo(DataApprovalTable);
