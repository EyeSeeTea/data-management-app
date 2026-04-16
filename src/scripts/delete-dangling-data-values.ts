import _ from "lodash";
import parse from "parse-typed-args";
import { D2Api, Id } from "../types/d2-api";
import { getConfig, Config } from "../models/Config";
import Project from "../models/Project";
import ProjectDb, { DataValue, getStringDataValue } from "../models/ProjectDb";
import ProjectsList from "../models/ProjectsList";
import { writeDataFilePath, readDataFilePath, assert } from "./common";

main().catch(err => {
    console.error(err);
    process.exit(1);
});

const paths = {
    danglingReport: "dangling-data-values-report",
    danglingToDelete: "dangling-data-values-to-delete",
};

async function main() {
    const parser = parse({
        opts: {
            url: {},
            project: {},
            generate: { switch: true },
            post: { switch: true },
        },
    });
    const { opts } = parser(process.argv);

    const usage = [
        "Usage: delete-dangling-data-values --url=DHIS2URL [--generate | --post] [--project=PROJECT_ID]",
        "",
        "Options:",
        "  --url        DHIS2 instance URL (required)",
        "  --generate   Detect dangling data values and write report files (dry run)",
        "  --post       Delete the dangling data values found by a previous --generate run",
        "  --project    Process only a specific project by ID (optional, processes all if omitted)",
    ].join("\n");

    const app = opts.url ? await getAppContext(opts.url) : null;

    if (!app) {
        console.error(usage);
        process.exit(1);
    } else if (opts.generate) {
        await generateReport(app, opts.project);
    } else if (opts.post) {
        await postDeletion(app);
    } else {
        console.error(usage);
        process.exit(1);
    }
}

interface AppContext {
    api: D2Api;
    config: Config;
}

async function getAppContext(baseUrl: string): Promise<AppContext> {
    const api = new D2Api({ baseUrl });
    const config = await getConfig(api);
    return { api, config };
}

interface ProjectDanglingResult {
    projectId: Id;
    projectName: string;
    countryName: string;
    danglingValues: DataValue[];
}

async function getProjectIds(api: D2Api, config: Config): Promise<Id[]> {
    const { objects: projectItems } = await new ProjectsList(api, config).get(
        {},
        { field: "id", order: "asc" },
        { page: 1, pageSize: 100000 }
    );

    return _(projectItems)
        .orderBy([project => project.parent.displayName, project => project.displayName])
        .map(project => project.id)
        .value();
}

async function generateReport(app: AppContext, projectIdFilter?: string) {
    const { api, config } = app;

    const projectIds = projectIdFilter ? [projectIdFilter] : await getProjectIds(api, config);

    console.log(`Processing ${projectIds.length} project(s)...`);

    const allResults: ProjectDanglingResult[] = [];
    let totalDangling = 0;

    for (const [idx, projectId] of projectIds.entries()) {
        let project: Project;
        try {
            project = await Project.get(api, config, projectId);
        } catch (err) {
            console.error(
                `  [${idx + 1}/${projectIds.length}] Error loading project ${projectId}: ${err}`
            );
            continue;
        }

        const projectName = project.name;
        const countryName = project.parentOrgUnit?.displayName || "Unknown";
        console.log(
            `  [${idx + 1}/${projectIds.length}] [${countryName}] ${projectName} (${projectId})`
        );

        const projectDb = new ProjectDb(project);
        const danglingValues = await projectDb.getDanglingDataValues();

        if (danglingValues.length > 0) {
            console.log(`    -> Found ${danglingValues.length} dangling data value(s)`);
            danglingValues.forEach(dv => console.log(`       ${getStringDataValue(dv)}`));

            allResults.push({ projectId, projectName, countryName, danglingValues });
            totalDangling += danglingValues.length;
        }
    }

    console.log(
        `\nSummary: ${totalDangling} dangling data value(s) across ${allResults.length} project(s)`
    );

    if (totalDangling === 0) {
        console.log("Nothing to delete.");
        return;
    }

    // Write human-readable report
    const report = allResults.map(result => ({
        project: `[${result.countryName}] ${result.projectName} (${result.projectId})`,
        count: result.danglingValues.length,
        dataValues: result.danglingValues.map(getStringDataValue),
    }));
    writeDataFilePath(paths.danglingReport, report);

    // Write DHIS2 delete payload
    const dataValuesToDelete = allResults.flatMap(result =>
        result.danglingValues.map(dv => ({
            dataElement: dv.dataElement.id,
            period: dv.period,
            orgUnit: result.projectId,
            categoryOptionCombo: dv.categoryOptionCombo.id,
            attributeOptionCombo: dv.attributeOptionCombo.id,
            value: "",
        }))
    );

    writeDataFilePath(paths.danglingToDelete, { dataValues: dataValuesToDelete });

    console.log(`\nReview the report, then run with --post to delete.`);
}

async function postDeletion(app: AppContext) {
    let metadata: { dataValues: Array<Record<string, string>> };
    try {
        metadata = readDataFilePath(paths.danglingToDelete);
    } catch (err) {
        console.error(`Cannot read delete payload. Run --generate first.`);
        process.exit(1);
    }

    const count = metadata.dataValues.length;
    if (count === 0) {
        console.log("No data values to delete.");
        return;
    }

    console.log(`Deleting ${count} dangling data value(s)...`);

    const res = await app.api.dataValues
        .postSet({ importStrategy: "DELETE" }, metadata as any)
        .getData();

    console.log("Response:", JSON.stringify(res, null, 2));
    assert(res.status === "SUCCESS", `Delete failed: ${JSON.stringify(res)}`);
    console.log("Done. Dangling data values deleted successfully.");
}
