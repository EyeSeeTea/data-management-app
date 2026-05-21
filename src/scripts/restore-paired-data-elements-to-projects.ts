import _ from "lodash";
import fs from "fs";
import parse from "parse-typed-args";
import { promiseMap } from "../migrations/utils";
import { Config } from "../models/Config";
import DataElementsSet from "../models/dataElementsSet";
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
        "restore-paired-data-elements-to-projects --url=DHIS2_URL [--persist] [--project-ids=ID1,ID2,...]";
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

async function run(app: App, options: { persist: boolean; filterIds: Set<Id> | null }) {
    const { api, config } = app;
    const { persist, filterIds } = options;

    const pairByMainId = buildPairByMainId(config);
    if (_.isEmpty(pairByMainId)) {
        console.error(`No paired DE mapping resolved for any main code: ${MAIN_CODES.join(", ")}`);
        return;
    }

    const mode = persist ? "PERSIST" : "DRY-RUN";
    console.info(`[${mode}] Pairs to look for:`);
    console.info(describePairs(pairByMainId, config));

    const allProjectIds = await getProjectIds(api, config);
    const projectIds = filterIds ? allProjectIds.filter(id => filterIds.has(id)) : allProjectIds;

    if (filterIds && projectIds.length < filterIds.size) {
        const missing = Array.from(filterIds).filter(id => !allProjectIds.includes(id));
        console.error(`WARN: ${missing.length} project id(s) not found: ${missing.join(", ")}`);
    }

    console.info(`Projects to scan: ${projectIds.length}`);

    let changedCount = 0;
    let totalAdded = 0;

    await promiseMap(projectIds, async projectId => {
        const project = await Project.get(api, config, projectId);
        const { project: updatedProject, added } = restorePairedToProject(project, pairByMainId);
        const addedTotal = sumAdded(added);
        if (addedTotal === 0) {
            console.info(`- No paired DEs to restore.`);
            return;
        }

        changedCount += 1;
        totalAdded += addedTotal;

        const label = `[${project.parentOrgUnit?.displayName}] ${project.name} (${project.id})`;
        console.info(
            `- ${label}: ${addedTotal} paired DE(s) ${persist ? "restored" : "to restore"}`
        );
        logAddedDetail(added, config);

        if (persist) {
            await updatedProject.save({ skipValidation: true }).catch(err => {
                console.error(`ERROR saving project ${project.id}:`, err);
            });
        } else {
            const json = await new ProjectDb(updatedProject).toJSON();
            fs.writeFileSync(`project-${project.id}.json`, JSON.stringify(json, null, 2), "utf-8");
        }
    });

    console.info(
        `Done. ${changedCount} project(s) ${persist ? "updated" : "would be updated"}, ` +
            `${totalAdded} paired DE(s) ${persist ? "restored" : "would be restored"}.`
    );
    if (!persist) {
        console.info("Re-run with --persist to apply the changes.");
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

function buildPairByMainId(config: Config): Record<Id, Id> {
    const dataElementsByCode = _.keyBy(config.dataElements, de => de.code);
    const pairedAttrCode = config.attributes.pairedDataElement.code;

    const result: Record<Id, Id> = {};
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
            result[mainDe.id] = pairedDe.id;
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

function describePairs(pairByMainId: Record<Id, Id>, config: Config): string {
    const byId = _.keyBy(config.dataElements, de => de.id);
    return Object.entries(pairByMainId)
        .map(([mainId, pairedId]) => {
            const mainCode = byId[mainId]?.code || mainId;
            const pairedCode = byId[pairedId]?.code || pairedId;
            return `  ${mainCode} (${mainId}) → ${pairedCode} (${pairedId})`;
        })
        .join("\n");
}

type AddedBySector = Record<Id, Id[]>;

interface AddedSummary {
    selection: AddedBySector;
    mer: AddedBySector;
    unique: AddedBySector;
}

function restorePairedToProject(
    project: Project,
    pairByMainId: Record<Id, Id>
): { project: Project; added: AddedSummary } {
    const { sectors, dataElementsSelection, dataElementsMER, uniqueIndicators } = project.data;

    const selection = computeRestoredSelection(dataElementsSelection, sectors, pairByMainId);
    const mer = computeRestoredSelection(dataElementsMER, sectors, pairByMainId);
    const unique = computeRestoredSelection(uniqueIndicators, sectors, pairByMainId);

    // Rebuild dataElementsSelection with groupPaired: true so the includePaired: true
    // expansion in Project.getSelectedDataElements re-inflates paired DEs into the
    // dataSet sections on save (this is the original/default app behavior).
    const rebuiltSelection = DataElementsSet.build(project.config, {
        groupPaired: true,
    }).updateSelected(selection.next);

    const updated = project.setObj({
        dataElementsSelection: rebuiltSelection,
        dataElementsMER: dataElementsMER.updateSelected(mer.next),
        uniqueIndicators: uniqueIndicators.updateSelected(unique.next),
    });

    return {
        project: updated,
        added: {
            selection: selection.added,
            mer: mer.added,
            unique: unique.added,
        },
    };
}

function computeRestoredSelection(
    set: DataElementsSet,
    sectors: Array<{ id: Id }>,
    pairByMainId: Record<Id, Id>
): { next: Record<Id, Id[]>; added: AddedBySector } {
    const next: Record<Id, Id[]> = {};
    const added: AddedBySector = {};

    for (const sector of sectors) {
        const selectedIds = set.data.selected[sector.id] || [];
        const idSet = new Set(selectedIds);

        const toAdd: Id[] = [];
        for (const [mainId, pairedId] of Object.entries(pairByMainId)) {
            if (idSet.has(mainId) && !idSet.has(pairedId)) {
                toAdd.push(pairedId);
            }
        }

        next[sector.id] = toAdd.length > 0 ? [...selectedIds, ...toAdd] : selectedIds;
        if (toAdd.length > 0) added[sector.id] = toAdd;
    }

    return { next, added };
}

function sumAdded(added: AddedSummary): number {
    const all = [..._.values(added.selection), ..._.values(added.mer), ..._.values(added.unique)];
    return _.sumBy(all, arr => arr.length);
}

function logAddedDetail(added: AddedSummary, config: Config) {
    const byId = _.keyBy(config.dataElements, de => de.id);
    const code = (id: Id) => byId[id]?.code || id;

    const sections: Array<{ name: string; data: AddedBySector }> = [
        { name: "selection", data: added.selection },
        { name: "MER", data: added.mer },
        { name: "uniqueIndicators", data: added.unique },
    ];

    for (const { name, data } of sections) {
        for (const [sectorId, ids] of Object.entries(data)) {
            if (ids.length === 0) continue;
            console.info(`    [${name}] sector=${sectorId} paired=${ids.map(code).join(",")}`);
        }
    }
}
