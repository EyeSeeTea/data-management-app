import _ from "lodash";
import { generateUid } from "d2/uid";
import { MetadataPayload, PartialModel, D2Dashboard, D2ReportTable } from "d2-api";
import Project from "./Project";
import { Category, CategoryOption } from "./Config";
import i18n from "../locales";

export default class ProjectDashboard {
    constructor(public project: Project) {}

    generate(): Pick<MetadataPayload, "dashboards" | "reportTables"> {
        const { project } = this;
        const reportTables: Array<PartialModel<D2ReportTable>> = [
            peopleTable(project),
            targetVsActualTable(project),
            targetVsActualIndicatorsTable(project),
        ];
        const dashboard: PartialModel<D2Dashboard> = {
            id: generateUid(),
            name: project.name,
            dashboardItems: reportTables.map(reportTable => ({
                id: generateUid(),
                type: "REPORT_TABLE",
                reportTable: { id: reportTable.id },
            })),
        };

        return { dashboards: [dashboard], reportTables };
    }
}

function getOrgUnitId(project: Project): string {
    const ou = project.organisationUnit;
    if (!ou) {
        throw new Error("No organisation defined for project");
    } else {
        return _.last(ou.path.split("/")) || "";
    }
}

function targetVsActualTable(project: Project): PartialModel<D2ReportTable> {
    const orgUnitId = getOrgUnitId(project);
    const dataElements = project.dataElements.get({ onlySelected: true, includePaired: true });
    const categories = [project.config.categories.targetActual];

    return {
        id: generateUid(),
        name: `${project.name} - ` + i18n.t("PM Target vs Actual"),
        numberType: "VALUE",
        publicAccess: "rw------",
        legendDisplayStyle: "FILL",
        rowSubTotals: true,
        showDimensionLabels: true,
        sortOrder: 0,
        topLimit: 0,
        aggregationType: "DEFAULT",
        legendDisplayStrategy: "FIXED",
        rowTotals: true,
        digitGroupSeparator: "SPACE",
        filterDimensions: ["ou"],
        columnDimensions: ["pe"],
        dataDimensionItems: dataElements.map(de => ({
            dataDimensionItemType: "DATA_ELEMENT",
            dataElement: { id: de.id },
        })),
        columns: [{ id: "pe" }],
        periods: project.getPeriods(),
        organisationUnits: [{ id: orgUnitId }],
        filters: [{ id: "ou" }],
        categoryDimensions: categories.map(category => ({
            category: { id: category.id },
            categoryOptions: category.categoryOptions.map(co => ({ id: co.id })),
        })),
        rows: [{ id: "dx" }, ...categories.map(category => ({ id: category.id }))],
        rowDimensions: ["dx", ...categories.map(category => category.id)],
    };
}

function targetVsActualIndicatorsTable(project: Project): PartialModel<D2ReportTable> {
    const orgUnitId = getOrgUnitId(project);
    const dataElements = project.dataElements.get({ onlySelected: true, includePaired: true });
    const indicators = project.getActualTargetIndicators(dataElements);

    return {
        id: generateUid(),
        name: `${project.name} - ` + i18n.t("PM Target vs Actual achieved (%)"),
        numberType: "VALUE",
        publicAccess: "rw------",
        legendDisplayStyle: "FILL",
        rowSubTotals: true,
        showDimensionLabels: true,
        sortOrder: 0,
        topLimit: 0,
        aggregationType: "DEFAULT",
        legendDisplayStrategy: "FIXED",
        rowTotals: true,
        digitGroupSeparator: "SPACE",
        filterDimensions: ["ou"],
        columnDimensions: ["pe"],
        dataDimensionItems: indicators.map(indicator => ({
            dataDimensionItemType: "INDICATOR",
            indicator: { id: indicator.id },
        })),
        columns: [{ id: "pe" }],
        periods: project.getPeriods(),
        organisationUnits: [{ id: orgUnitId }],
        filters: [{ id: "ou" }],
        categoryDimensions: [],
        rows: [{ id: "dx" }],
        rowDimensions: ["dx"],
    };
}

function peopleTable(project: Project): PartialModel<D2ReportTable> {
    const orgUnitId = getOrgUnitId(project);
    const dataElementsPeople = project.dataElements.get({
        onlySelected: true,
        peopleOrBenefit: "people",
        includePaired: true,
    });
    const categories = project.config.categories;
    const categoriesForRows = [categories.gender, categories.newRecurring];
    const dimensionsData: Array<{ category: Category; categoryOptions?: CategoryOption[] }> = [
        { category: categories.gender },
        { category: categories.newRecurring },
        {
            category: categories.targetActual,
            categoryOptions: categories.targetActual.categoryOptions.filter(
                co => co.code === "ACTUAL"
            ),
        },
    ];

    return {
        id: generateUid(),
        name: `${project.name} - ` + i18n.t("PM People Indicators Gender Breakdown"),
        publicAccess: "rw------",
        numberType: "VALUE",
        legendDisplayStyle: "FILL",
        showDimensionLabels: true,
        sortOrder: 0,
        topLimit: 0,
        aggregationType: "DEFAULT",
        legendDisplayStrategy: "FIXED",
        colSubTotals: true,
        rowTotals: true,
        digitGroupSeparator: "SPACE",
        columnDimensions: ["pe"],
        dataDimensionItems: dataElementsPeople.map(de => ({
            dataDimensionItemType: "DATA_ELEMENT",
            dataElement: { id: de.id },
        })),
        columns: [{ id: "pe" }],
        periods: project.getPeriods(),
        organisationUnits: [{ id: orgUnitId }],
        filterDimensions: ["ou", categories.targetActual.id],
        filters: [{ id: "ou" }, { id: categories.targetActual.id }],
        categoryDimensions: dimensionsData.map(({ category, categoryOptions }) => ({
            category: { id: category.id },
            categoryOptions: (categoryOptions || category.categoryOptions).map(co => ({
                id: co.id,
            })),
        })),
        rows: [{ id: "dx" }, ...categoriesForRows.map(category => ({ id: category.id }))],
        rowDimensions: ["dx", ...categoriesForRows.map(category => category.id)],
    };
}
