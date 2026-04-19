import _ from "lodash";
import parse from "parse-typed-args";

import { D2Api, Id, MetadataPick } from "../types/d2-api";
import { writeDataFilePath } from "./common";
import { promiseMap } from "../migrations/utils";
import { getUid } from "../utils/dhis2";
import CountryDashboard from "../models/CountryDashboard";
import { D2Sharing } from "../models/Sharing";
import { Config, getConfig } from "../models/Config";

/*
    Update sharing (publicAccess, externalAccess, userAccesses, userGroupAccesses)
    on every existing country dashboard and its visualizations, using the sharing
    computed by CountryDashboard.getSharing().

    npx tsx src/scripts/fix-country-dashboard-sharing.ts \
            --url="http://server.com" [--auth=user:pass] [--country-ids=id1,id2] [--persist]
*/

type D2Dashboard = MetadataPick<{
    dashboards: { fields: { $owner: true } };
}>["dashboards"][number];

type D2Visualization = MetadataPick<{
    visualizations: { fields: { $owner: true } };
}>["visualizations"][number];

type D2DashboardItem = D2Dashboard["dashboardItems"][number];

interface Country {
    readonly id: Id;
    readonly displayName: string;
}

interface SharingComputation {
    readonly sharingByCountryId: Readonly<Record<Id, D2Sharing>>;
    readonly failedCountries: Country[];
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

async function main() {
    const parser = parse({
        opts: {
            url: {},
            auth: {},
            "country-ids": {},
            persist: { switch: true },
        },
    });
    const { opts } = parser(process.argv);
    const { url, auth, "country-ids": countryIdsRaw, persist } = opts;

    const usage =
        "fix-country-dashboard-sharing --url=<DHIS2 URL> [--auth=user:pass] [--country-ids=id1,id2] [--persist]";
    if (!url) {
        console.error(usage);
        process.exit(1);
    }

    const [username, password] = auth ? auth.split(":") : ["", ""];
    const api = new D2Api({ baseUrl: url, auth: { password, username }, agent: {} });
    const config = await getConfig(api);

    const filterIds = countryIdsRaw ? countryIdsRaw.split(",").map(s => s.trim()) : undefined;

    const countries = await getCountries(api, config, filterIds);
    console.debug(`Countries: ${countries.length}`);
    if (countries.length === 0) return;

    const dashboardIds = countries.map(c => getUid("country-dashboard", c.id));
    const dashboards = await fetchDashboards(api, dashboardIds);
    console.debug(`Existing country dashboards: ${dashboards.length} / ${dashboardIds.length}`);

    const vizIds = extractVizIds(dashboards);
    const visualizations = await fetchVisualizations(api, vizIds);
    console.debug(`Visualizations: ${visualizations.length} / ${vizIds.length}`);

    const { sharingByCountryId, failedCountries } = await computeSharingPerCountry(
        api,
        config,
        countries
    );
    if (failedCountries.length > 0) {
        console.error(
            `Sharing computation failed for ${failedCountries.length}/${countries.length} countries: ` +
                failedCountries.map(c => `${c.displayName} (${c.id})`).join(", ")
        );
    }

    const { updatedDashboards, updatedVisualizations } = applySharing(
        dashboards,
        visualizations,
        countries,
        sharingByCountryId
    );
    console.debug(
        `Payload: dashboards=${updatedDashboards.length}, visualizations=${updatedVisualizations.length}`
    );

    const payload = {
        dashboards: updatedDashboards,
        visualizations: updatedVisualizations,
    };

    writeDataFilePath("sharing-payload", payload);
    console.debug("payload saved to disk");

    const res = await api.metadata
        .post(payload, { importStrategy: "UPDATE", importMode: persist ? "COMMIT" : "VALIDATE" })
        .getData();
    console.debug(`Import status: ${JSON.stringify(res.status)}`);
    if (res.status !== "OK") throw new Error(JSON.stringify(res, null, 2));
}

async function getCountries(
    api: D2Api,
    config: Config,
    filterIds: Id[] | undefined
): Promise<Country[]> {
    const { objects } = await api.models.organisationUnits
        .get({
            paging: false,
            fields: { id: true, displayName: true },
            filter: { level: { eq: String(config.base.orgUnits.levelForCountries) } },
        })
        .getData();

    const sorted = _(objects)
        .map(c => ({ id: c.id, displayName: c.displayName }))
        .sortBy(c => c.displayName)
        .value();

    return filterIds ? sorted.filter(c => filterIds.includes(c.id)) : sorted;
}

async function fetchChunked<T>(ids: Id[], fetchChunk: (chunk: Id[]) => Promise<T[]>): Promise<T[]> {
    if (ids.length === 0) return [];
    const chunks = await promiseMap(_.chunk(ids, 100), fetchChunk);
    return chunks.flat();
}

async function fetchDashboards(api: D2Api, ids: Id[]): Promise<D2Dashboard[]> {
    return fetchChunked(ids, async chunk => {
        const { dashboards } = await api.metadata
            .get({
                dashboards: {
                    fields: { $owner: true },
                    filter: { id: { in: chunk } },
                },
            })
            .getData();
        return dashboards;
    });
}

async function fetchVisualizations(api: D2Api, ids: Id[]): Promise<D2Visualization[]> {
    return fetchChunked(ids, async chunk => {
        const { visualizations } = await api.metadata
            .get({
                visualizations: {
                    fields: { $owner: true },
                    filter: { id: { in: chunk } },
                },
            })
            .getData();
        return visualizations;
    });
}

function getVizIdFromItem(di: D2DashboardItem): Id | undefined {
    const anyDi = di as {
        chart?: { id?: Id };
        reportTable?: { id?: Id };
        visualization?: { id?: Id };
    };
    return anyDi.chart?.id ?? anyDi.reportTable?.id ?? anyDi.visualization?.id;
}

function extractVizIds(dashboards: D2Dashboard[]): Id[] {
    return _(dashboards)
        .flatMap(d => d.dashboardItems ?? [])
        .map(getVizIdFromItem)
        .compact()
        .uniq()
        .value();
}

async function computeSharingPerCountry(
    api: D2Api,
    config: Config,
    countries: Country[]
): Promise<SharingComputation> {
    const results = await promiseMap(countries, async country => {
        console.debug(`Generating sharing for ${country.displayName} (${country.id})...`);
        try {
            const cd = await CountryDashboard.build(api, config, country.id);
            return { country, sharing: cd.getSharing() };
        } catch (e) {
            console.error(`Cannot generate sharing for ${country.displayName} (${country.id}):`, e);
            return { country, sharing: null };
        }
    });

    const sharingByCountryId = Object.fromEntries(
        results
            .filter((r): r is { country: Country; sharing: D2Sharing } => r.sharing !== null)
            .map(r => [r.country.id, r.sharing] as const)
    );
    const failedCountries = results.filter(r => r.sharing === null).map(r => r.country);

    return { sharingByCountryId, failedCountries };
}

function withSharing<T>(obj: T, sharing: D2Sharing): T {
    return {
        ...obj,
        publicAccess: sharing.publicAccess,
        externalAccess: sharing.externalAccess,
        userAccesses: sharing.userAccesses,
        userGroupAccesses: sharing.userGroupAccesses,
    };
}

function applySharing(
    dashboards: D2Dashboard[],
    visualizations: D2Visualization[],
    countries: Country[],
    sharingByCountryId: Readonly<Record<Id, D2Sharing>>
): {
    updatedDashboards: D2Dashboard[];
    updatedVisualizations: D2Visualization[];
} {
    const countryByDashboardId: Readonly<Record<Id, Id>> = Object.fromEntries(
        countries.map(c => [getUid("country-dashboard", c.id), c.id])
    );

    const dashboardByVizId: Readonly<Record<Id, Id>> = Object.fromEntries(
        _(dashboards)
            .flatMap(d =>
                (d.dashboardItems ?? []).map(di => {
                    const vid = getVizIdFromItem(di);
                    return vid ? ([vid, d.id] as const) : null;
                })
            )
            .compact()
            .value()
    );

    const updatedDashboards = _(dashboards)
        .map(d => {
            const sharing = sharingByCountryId[countryByDashboardId[d.id]];
            if (!sharing) {
                console.error(`No sharing computed for dashboard ${d.id} — skipping`);
                return undefined;
            }
            return withSharing(d, sharing);
        })
        .compact()
        .value();

    const updatedVisualizations = _(visualizations)
        .map(v => {
            const dashId = dashboardByVizId[v.id];
            const sharing = sharingByCountryId[countryByDashboardId[dashId]];
            if (!sharing) {
                console.error(
                    `No sharing for visualization ${v.id} (dashboard ${dashId}) — skipping`
                );
                return undefined;
            }
            return withSharing(v, sharing);
        })
        .compact()
        .value();

    return { updatedDashboards, updatedVisualizations };
}
