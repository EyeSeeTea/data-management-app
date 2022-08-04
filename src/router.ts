import React from "react";
import { useHistory } from "react-router";
import { stringify } from "querystring";

const routes = {
    projects: () => "/",
    "projects.new": () => `/projects/new`,
    "projects.edit": ({ id }: { id: string }) => `/projects/edit/${id}`,
    report: () => "/report",
    actualValues: ({ id }: { id: string }) => `/actual-values/${id}`,
    targetValues: ({ id }: { id: string }) => `/target-values/${id}`,
    projectDashboard: ({ id }: { id: string }) => `/project-dashboard/${id}`,
    awardNumberDashboard: ({ id }: { id: string }) => `/award-number-dashboard/${id}`,
    countryDashboard: ({ id }: { id: string }) => `/country-dashboard/${id}`,
    dataApproval: ({
        id,
        dataSetType,
        period,
    }: {
        id: string;
        dataSetType?: string;
        period?: string;
    }) =>
        dataSetType && period
            ? `/data-approval/${id}/${dataSetType}/${period}`
            : `/data-approval/${id}`,
    countries: () => `/countries`,
};

type Routes = typeof routes;
export type GoTo = typeof generateUrl;

export function generateUrl<Name extends keyof Routes>(
    name: Name,
    params: Parameters<Routes[Name]>[0] = undefined,
    search: Record<string, string> | undefined = undefined
): string {
    const fn = routes[name];
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const baseUrl = params ? fn(params as any) : fn(undefined as any);
    return baseUrl + (search ? `?${stringify(search)}` : "");
}

export function useGoTo(): GoTo {
    const history = useHistory();
    const goTo: GoTo = React.useCallback(
        (name, params) => {
            const url = generateUrl(name, params);
            history.push(url);
            return url;
        },
        [history]
    );
    return goTo;
}
