import _ from "lodash";
import fs from "fs";
import parse from "parse-typed-args";
import { promiseMap } from "../migrations/utils";
import { Config } from "../models/Config";
import DataElementsSet, { getSubs } from "../models/dataElementsSet";
import Project from "../models/Project";
import ProjectDashboardSave from "../models/ProjectDashboardSave";
import ProjectDb from "../models/ProjectDb";
import ProjectsList from "../models/ProjectsList";
import { D2Api, Id } from "../types/d2-api";
import { App, getApp } from "./common";

const MAIN_CODES = ["B060300", "B060500", "B061000", "B130200", "B130400", "B130600"] as const;

interface Opts {
    url?: string;
    persist?: boolean;
    "project-ids"?: string;
}

main().catch(err => {
    console.error("ERROR", err);
    process.exit(1);
});

async function main() {
    const parser = parse({
        opts: {
            url: {},
            persist: { switch: true },
            "project-ids": {},
        },
    });
    const { opts } = parser(process.argv) as { opts: Opts };

    const usage =
        "remove-paired-sub-indicators-from-projects --url=DHIS2_URL [--persist] [--project-ids=ID1,ID2,...]";
    if (!opts.url) {
        console.error(usage);
        process.exit(1);
    }

    const app = await getApp({ baseUrl: opts.url });
    const persist = Boolean(opts.persist);
    const filterIds = parseProjectIds(opts["project-ids"]);

    await run(app, { persist, filterIds });
}

function parseProjectIds(s: string | undefined): Set<Id> | null {
    if (!s) return null;
    const ids = s
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);
    return new Set(ids);
}

interface PairedInfo {
    mainId: Id;
    mainCode: string;
    pairedId: Id;
    pairedCode: string;
    subs: Array<{ id: Id; code: string; name: string }>;
}

async function run(app: App, options: { persist: boolean; filterIds: Set<Id> | null }) {
    const { api, config } = app;
    const { persist, filterIds } = options;

    const pairedInfos = buildPairedInfos(config);
    if (_.isEmpty(pairedInfos)) {
        console.error(`No paired DE mapping resolved for any main code: ${MAIN_CODES.join(", ")}`);
        return;
    }

    const subIdsToRemove = new Set<Id>(
        _(pairedInfos)
            .flatMap(p => p.subs.map(s => s.id))
            .value()
    );

    const mode = persist ? "PERSIST" : "DRY-RUN";
    console.info(`[${mode}] Sub-indicators to remove per paired:`);
    console.info(describeSubsTree(pairedInfos));
    console.info(
        `Total: ${subIdsToRemove.size} sub-indicators (de ${pairedInfos.length} paired DE(s))`
    );

    const allProjectIds = await getProjectIds(api, config);
    const projectIds = filterIds ? allProjectIds.filter(id => filterIds.has(id)) : allProjectIds;

    if (filterIds && projectIds.length < filterIds.size) {
        const missing = Array.from(filterIds).filter(id => !allProjectIds.includes(id));
        console.error(`WARN: ${missing.length} project id(s) not found: ${missing.join(", ")}`);
    }

    console.info(`Projects to scan: ${projectIds.length}`);

    let changedCount = 0;
    let totalRemoved = 0;
    const updatedProjects: Array<{ id: Id; name: string }> = [];

    await promiseMap(projectIds, async projectId => {
        const project = await Project.get(api, config, projectId);
        const { project: updatedProject, removed } = removeSubsFromProject(project, subIdsToRemove);
        const removedTotal = sumRemoved(removed);
        if (removedTotal === 0) {
            console.info(
                `- [${project.parentOrgUnit?.displayName}] ${project.name} (${project.id}): no sub indicators to remove`
            );
            return;
        }

        changedCount += 1;
        totalRemoved += removedTotal;

        const label = `[${project.parentOrgUnit?.displayName}] ${project.name} (${project.id})`;
        console.info(`- ${label}: ${removedTotal} sub(s) ${persist ? "removed" : "to remove"}`);
        logRemovedDetail(removed, config);

        if (persist) {
            await updatedProject.save({ skipValidation: true });
            await new ProjectDashboardSave(updatedProject).execute();
            updatedProjects.push({ id: project.id, name: project.name });
        } else {
            const json = await new ProjectDb(updatedProject).toJSON({ skipValidation: true });
            fs.writeFileSync(`project-${project.id}.json`, JSON.stringify(json, null, 2), "utf-8");
        }
    });

    console.info(
        `Done. ${changedCount} project(s) ${persist ? "updated" : "would be updated"}, ` +
            `${totalRemoved} sub(s) ${persist ? "removed" : "would be removed"}.`
    );

    await removeSubsFromDataElementGroups(api, config, subIdsToRemove, persist);

    if (persist && updatedProjects.length > 0) {
        console.info(`\nUpdated projects (${updatedProjects.length}):`);
        for (const p of updatedProjects) {
            console.info(`  - ${p.name} (${p.id})`);
        }
    }

    if (!persist) {
        console.info("Re-run with --persist to apply the changes.");
    }
}

async function removeSubsFromDataElementGroups(
    api: D2Api,
    config: Config,
    subIdsToRemove: Set<Id>,
    persist: boolean
): Promise<void> {
    const groupCodes = [
        config.base.dataElementGroups.sub,
        config.base.dataElementGroups.reportableSub,
    ];

    console.info(`\nUpdating DataElementGroups: ${groupCodes.join(", ")}`);

    const { dataElementGroups } = await api.metadata
        .get({
            dataElementGroups: {
                fields: { $owner: true },
                filter: { code: { in: groupCodes } },
            },
        })
        .getData();

    const missing = groupCodes.filter(code => !dataElementGroups.some(g => g.code === code));
    if (missing.length > 0) {
        console.error(`WARN: DataElementGroup(s) not found by code: ${missing.join(", ")}`);
    }

    const groupsToUpdate = dataElementGroups
        .map(group => {
            const before = group.dataElements.length;
            const filtered = group.dataElements.filter(de => !subIdsToRemove.has(de.id));
            const removedCount = before - filtered.length;
            return { group, filtered, before, removedCount };
        })
        .filter(x => x.removedCount > 0);

    if (groupsToUpdate.length === 0) {
        console.info("No DataElementGroup changes needed.");
        return;
    }

    for (const { group, before, removedCount } of groupsToUpdate) {
        console.info(
            `- ${group.code} (${group.id}): ${before} → ${before - removedCount} members ` +
                `(${removedCount} ${persist ? "removed" : "to remove"})`
        );
    }

    if (!persist) return;

    const payload = groupsToUpdate.map(({ group, filtered }) => ({
        ...group,
        dataElements: filtered.map(de => ({ id: de.id })),
    }));

    const response = await api.metadata
        .post({ dataElementGroups: payload }, { importMode: "COMMIT" })
        .getData();

    console.info(`DataElementGroups update: status=${response.status}`);
    if (response.status !== "OK") {
        console.error("ERROR posting dataElementGroups:", JSON.stringify(response, null, 2));
    }
}

async function getProjectIds(api: D2Api, config: Config): Promise<Id[]> {
    const { objects } = await new ProjectsList(api, config).get(
        {},
        { field: "id", order: "asc" },
        { page: 1, pageSize: 100000 }
    );
    return _(objects)
        .orderBy([p => p.parent.displayName, p => p.displayName])
        .map(p => p.id)
        .value();
}

function buildPairedInfos(config: Config): PairedInfo[] {
    const dataElementsByCode = _.keyBy(config.dataElements, de => de.code);
    const pairedAttrCode = config.attributes.pairedDataElement.code;

    const result: PairedInfo[] = [];
    for (const mainCode of MAIN_CODES) {
        const mainDe = dataElementsByCode[mainCode];
        if (!mainDe) {
            console.error(`WARN: main code ${mainCode} not found in metadata`);
            continue;
        }
        const value = getAttributeValue(mainDe, pairedAttrCode);
        if (!value) {
            console.error(`WARN: ${mainCode} has no ${pairedAttrCode} value`);
            continue;
        }
        const pairedCodes = value
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);
        if (pairedCodes.length !== 1) {
            console.error(
                `WARN: ${mainCode} has unexpected ${pairedAttrCode} value: "${value}" — taking all`
            );
        }
        for (const pairedCode of pairedCodes) {
            const pairedDe = dataElementsByCode[pairedCode];
            if (!pairedDe) {
                console.error(
                    `WARN: paired code ${pairedCode} (for main ${mainCode}) not found in metadata`
                );
                continue;
            }
            const subs = getSubs(config, pairedDe.id);
            const subInfos = _(subs)
                .map(s => ({ id: s.id, code: s.code, name: s.name }))
                .orderBy(s => s.code)
                .value();
            result.push({
                mainId: mainDe.id,
                mainCode: mainDe.code,
                pairedId: pairedDe.id,
                pairedCode: pairedDe.code,
                subs: subInfos,
            });
        }
    }
    return result;
}

function getAttributeValue(
    dataElement: {
        attributeValues: Array<{ attribute: { code: string }; value: string }>;
    },
    attributeCode: string
): string | null {
    const av = dataElement.attributeValues.find(av => av.attribute.code === attributeCode);
    return av?.value || null;
}

function describeSubsTree(pairedInfos: PairedInfo[]): string {
    return pairedInfos
        .map(p => {
            const header = `  ${p.mainCode} → ${p.pairedCode} (${p.pairedId})`;
            if (p.subs.length === 0) return `${header}\n    (no sub indicators found)`;
            const subLines = p.subs.map(s => `    - ${s.code} ${s.name} (${s.id})`).join("\n");
            return `${header}\n${subLines}`;
        })
        .join("\n");
}

type RemovedBySector = Record<Id, Id[]>;

interface RemovedSummary {
    selection: RemovedBySector;
    mer: RemovedBySector;
    unique: RemovedBySector;
}

function removeSubsFromProject(
    project: Project,
    subIdsToRemove: Set<Id>
): { project: Project; removed: RemovedSummary } {
    const { sectors, dataElementsSelection, dataElementsMER, uniqueIndicators } = project.data;

    const selection = computeFilteredSelection(dataElementsSelection, sectors, subIdsToRemove);
    const mer = computeFilteredSelection(dataElementsMER, sectors, subIdsToRemove);
    const unique = computeFilteredSelection(uniqueIndicators, sectors, subIdsToRemove);

    const cleanedSelection = stripSubsFromDataElementsBySector(
        project.config,
        dataElementsSelection.updateSelected(selection.next),
        subIdsToRemove
    );
    const cleanedMER = stripSubsFromDataElementsBySector(
        project.config,
        dataElementsMER.updateSelected(mer.next),
        subIdsToRemove
    );
    const cleanedUnique = stripSubsFromDataElementsBySector(
        project.config,
        uniqueIndicators.updateSelected(unique.next),
        subIdsToRemove
    );

    const updated = project.setObj({
        dataElementsSelection: cleanedSelection,
        dataElementsMER: cleanedMER,
        uniqueIndicators: cleanedUnique,
    });

    return {
        project: updated,
        removed: {
            selection: selection.removed,
            mer: mer.removed,
            unique: unique.removed,
        },
    };
}

/**
 * Returns a copy of the DataElementsSet where the sub ids are removed from:
 *  - dataElementsBySector[sectorId] top-level entries.
 *  - Each remaining DE's pairedDataElements (nested).
 *
 * This is required because Project.getSelectedDataElements() runs
 * `set.get({ onlySelected: true, includePaired: true })`, and the
 * `includePaired` expansion uses `de.pairedDataElements` to re-inflate
 * sub/paired ids that point at the sub via DM_PAIRED_DE. Without stripping
 * those references, the subs reappear in dataSet sections, dataSetElements
 * and dashboard visualizations on the next save.
 */
function stripSubsFromDataElementsBySector(
    config: Config,
    set: DataElementsSet,
    subIdsToRemove: Set<Id>
): DataElementsSet {
    const cleanedBySector = _.mapValues(set.data.dataElementsBySector, dataElements =>
        dataElements
            .filter(de => !subIdsToRemove.has(de.id))
            .map(de => ({
                ...de,
                pairedDataElements: de.pairedDataElements.filter(
                    paired => !subIdsToRemove.has(paired.id)
                ),
            }))
    );

    return new DataElementsSet(config, {
        ...set.data,
        dataElementsBySector: cleanedBySector,
    });
}

function computeFilteredSelection(
    set: DataElementsSet,
    sectors: Array<{ id: Id }>,
    subIdsToRemove: Set<Id>
): { next: Record<Id, Id[]>; removed: RemovedBySector } {
    const next: Record<Id, Id[]> = {};
    const removed: RemovedBySector = {};

    for (const sector of sectors) {
        const selectedIds = set.data.selected[sector.id] || [];

        const toRemove: Id[] = [];
        const kept: Id[] = [];
        for (const id of selectedIds) {
            if (subIdsToRemove.has(id)) {
                toRemove.push(id);
            } else {
                kept.push(id);
            }
        }

        next[sector.id] = kept;
        if (toRemove.length > 0) removed[sector.id] = toRemove;
    }

    return { next, removed };
}

function sumRemoved(removed: RemovedSummary): number {
    const all = [
        ..._.values(removed.selection),
        ..._.values(removed.mer),
        ..._.values(removed.unique),
    ];
    return _.sumBy(all, arr => arr.length);
}

function logRemovedDetail(removed: RemovedSummary, config: Config) {
    const byId = _.keyBy(config.dataElements, de => de.id);
    const code = (id: Id) => byId[id]?.code || id;

    const sections: Array<{ name: string; data: RemovedBySector }> = [
        { name: "selection", data: removed.selection },
        { name: "MER", data: removed.mer },
        { name: "uniqueIndicators", data: removed.unique },
    ];

    for (const { name, data } of sections) {
        for (const [sectorId, ids] of Object.entries(data)) {
            if (ids.length === 0) continue;
            console.info(`    [${name}] sector=${sectorId} subs=${ids.map(code).join(",")}`);
        }
    }
}
