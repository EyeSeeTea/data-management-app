import _ from "lodash";
import { Config } from "./Config";
import { PartialPersistedModel, PartialModel, D2Api, D2Visualization } from "../types/d2-api";
import { Ref, D2DashboardItem, Id } from "../types/d2-api";
import Project from "./Project";
import i18n from "../locales";
import { getUid } from "../utils/dhis2";
import ProjectSharing from "./ProjectSharing";
import {
    getReportTableItem,
    getChartDashboardItem,
    toItemWidth,
    positionItems,
    dimensions,
    MaybeD2Visualization,
    getD2Visualization,
    PositionItemsOptions,
    Visualization,
    dataElementItems,
    indicatorItems,
    VisualizationDefinition,
} from "./Dashboard";
import { getActualTargetIndicators, getCostBenefitIndicators } from "./indicators";
import { Response } from "./Response";
import {
    ProjectsListDashboard,
    getProjectsListDashboard,
    DashboardSourceMetadata,
    Condition,
} from "./ProjectsListDashboard";
import { getVisualizationPeriods } from "./Period";
import { DataElement as MerDataElement } from "./dataElementsSet";
import * as texts from "./ProjectDashboardTexts";

const INTRODUCTION_TEXT_HEIGHT = 12;
const SPACER_HEIGHT = 4;
const MIN_TEXT_HEIGHT = 4;
const MAX_TEXT_HEIGHT = 6;
const CHARS_PER_GRID_UNIT = 50;

function computeTextHeight(text: string): number {
    const heightByChars = Math.ceil(text.length / CHARS_PER_GRID_UNIT);
    // multiply by 2 to convert to vertical grid units (1 unit ~ 2 lines of text)
    return Math.max(MIN_TEXT_HEIGHT, Math.min(MAX_TEXT_HEIGHT, heightByChars));
}

export default class ProjectDashboard {
    dataElements: ProjectsListDashboard["dataElements"];
    merDataElements: Record<"all" | "people" | "benefit", MerDataElement[]>;
    categoryOnlyNew: { id: Id; categoryOptions: Ref[] };
    categoryOnlyMale: { id: Id; categoryOptions: Ref[] };
    categoryOnlyFemale: { id: Id; categoryOptions: Ref[] };

    constructor(
        private config: Config,
        private projectsListDashboard: ProjectsListDashboard,
        private dashboardType: "project" | "awardNumber",
        project?: Project
    ) {
        this.dataElements = this.projectsListDashboard.dataElements;

        const projectMerDataElements = _(project?.dataElementsMER.getAllSelected())
            .sortBy(de => de.code)
            .uniqBy(de => de.id)
            .value();

        this.merDataElements = {
            all: projectMerDataElements,
            people: projectMerDataElements.filter(de => de.peopleOrBenefit === "people"),
            benefit: projectMerDataElements.filter(de => de.peopleOrBenefit === "benefit"),
        };

        this.categoryOnlyNew = {
            id: config.categories.newRecurring.id,
            categoryOptions: [{ id: config.categoryOptions.new.id }],
        };

        this.categoryOnlyMale = {
            id: config.categories.gender.id,
            categoryOptions: [{ id: config.categoryOptions.male.id }],
        };
        this.categoryOnlyFemale = {
            id: config.categories.gender.id,
            categoryOptions: [{ id: config.categoryOptions.female.id }],
        };

        this.config = config;
    }

    static async buildForProject(
        api: D2Api,
        config: Config,
        project: Project,
        initialMetadata?: DashboardSourceMetadata
    ): Promise<ProjectDashboard> {
        const condition: Condition = { type: "project", id: project.id, initialMetadata };
        const projectsListDashboard = await getProjectsListDashboard(api, config, condition);
        return new ProjectDashboard(config, projectsListDashboard, "project", project);
    }

    static async buildForAwardNumber(
        api: D2Api,
        config: Config,
        awardNumber: string,
        initialMetadata?: DashboardSourceMetadata
    ): Promise<ProjectDashboard> {
        const condition: Condition = { type: "awardNumber", value: awardNumber, initialMetadata };
        const projectsListDashboard = await getProjectsListDashboard(api, config, condition);
        return new ProjectDashboard(config, projectsListDashboard, "awardNumber");
    }

    generate(options: { minimumOrgUnits?: number } = {}) {
        const { config, projectsListDashboard } = this;
        const { minimumOrgUnits } = options;

        if (!_.isNil(minimumOrgUnits) && projectsListDashboard.orgUnits.length < minimumOrgUnits)
            return { dashboards: [], visualizations: [] };

        const positionItemsOptions: PositionItemsOptions = {
            maxWidth: toItemWidth(100),
            defaultWidth: toItemWidth(50),
            defaultHeight: 20, // 20 vertical units ~ 50% of viewport height
        };

        if (this.dashboardType === "project") {
            const { dashboardItemsToSave, visualizations } = this.buildProjectDashboard();
            const dashboard = {
                id: getUid("dashboard", projectsListDashboard.id),
                name: projectsListDashboard.name,
                dashboardItems: positionItems(dashboardItemsToSave, positionItemsOptions),
                ...new ProjectSharing(
                    config,
                    projectsListDashboard
                ).getSharingAttributesForDashboard(),
            };
            return { dashboards: [dashboard], visualizations };
        }

        const rawVisualizations = this.getAwardNumberVisualizations();

        const items: Array<PartialModel<D2DashboardItem>> = _(rawVisualizations)
            .map(visualization => {
                return visualization.type === "PIVOT_TABLE"
                    ? getReportTableItem(visualization)
                    : getChartDashboardItem(visualization);
            })
            .compact()
            .value();

        const visualizations = _.compact(rawVisualizations);

        const dashboard = {
            id: getUid("dashboard", projectsListDashboard.id),
            name: projectsListDashboard.name,
            dashboardItems: positionItems(items, positionItemsOptions),
            ...new ProjectSharing(config, projectsListDashboard).getSharingAttributesForDashboard(),
        };

        return { dashboards: [dashboard], visualizations };
    }

    private buildProjectDashboard(): {
        dashboardItemsToSave: Array<PartialModel<D2DashboardItem>>;
        visualizations: D2Visualization[];
    } {
        const dashboardId = this.projectsListDashboard.id;
        const fullWidth = toItemWidth(100);
        const halfWidth = toItemWidth(50);

        const merBenefitsChart = this.merTargetVsActualBenefitsChart();
        const merPeopleChart = this.merTargetVsActualPeopleChart();
        const benefitsTable = this.targetVsActualBenefitsTable();
        const peopleTable = this.targetVsActualPeopleTable();
        const benefitsLineChart = this.targetVsActualBenefitsLineChart();
        const peopleLineChart = this.targetVsActualPeopleLineChart();
        const genderNewLineChart = this.targetVsActualPeopleLineChartGenderNewOnly();
        const newOnlyLineChart = this.targetVsActualPeopleLineChartNewOnly();
        const maleLineChart = this.targetVsActualPeopleLineChartMaleOnly();
        const femaleLineChart = this.targetVsActualPeopleLineChartFemaleOnly();
        const maleLineColumn = this.targetVsActualPeopleLineColumnChartMaleOnly();
        const femaleLineColumn = this.targetVsActualPeopleLineColumnChartFemaleOnly();
        const achievedBenefitsToDate = this.achievedBenefitsTable({ toDate: true });
        const achievedPeopleToDate = this.achievedPeopleTable();
        const achievedBenefitChartViz = this.achievedBenefitChart();
        const achievedPeopleChartViz = this.achievedPeopleChart();
        const genderChartViz = this.genderChart();
        const costBenefitTableViz = this.costBenefitTable();

        let spacerIndex = 0;
        const spacer = (): PartialModel<D2DashboardItem> => ({
            id: getUid(`project-spacer-${spacerIndex++}`, dashboardId),
            type: "TEXT",
            text: "SPACER_ITEM_FOR_DASHBOARD_LAYOUT_CONVENIENCE",
            height: SPACER_HEIGHT,
            width: fullWidth,
        });

        let emptyVizIndex = 0;
        const emptyVizPlaceholder = (): PartialModel<D2DashboardItem> => ({
            id: getUid(`project-empty-viz-${emptyVizIndex++}`, dashboardId),
            type: "TEXT",
            text: "SPACER_ITEM_FOR_DASHBOARD_LAYOUT_CONVENIENCE",
            width: halfWidth,
            height: 20,
        });

        const text = (
            keyName: string,
            content: string,
            width: number,
            height?: number
        ): PartialModel<D2DashboardItem> => ({
            id: getUid(keyName, dashboardId),
            type: "TEXT",
            text: i18n.t(content),
            width,
            height: height ?? computeTextHeight(content),
        });

        const viz = (visualization: MaybeD2Visualization): PartialModel<D2DashboardItem> => {
            if (!visualization) return emptyVizPlaceholder();
            const item =
                visualization.type === "PIVOT_TABLE"
                    ? getReportTableItem(visualization)
                    : getChartDashboardItem(visualization);
            return item ?? emptyVizPlaceholder();
        };

        const dashboardItemsToSave = _.compact([
            text(
                "introduction-text-project-dashboard",
                texts.introductionText,
                fullWidth,
                INTRODUCTION_TEXT_HEIGHT
            ),
            text("comparison-mer-section-project", texts.comparisonMerSectionText, fullWidth),
            text(
                "mer-benefits-chart-desc-project",
                texts.merBenefitsChartDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            text(
                "mer-people-chart-desc-project",
                texts.merPeopleChartDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            viz(merBenefitsChart),
            viz(merPeopleChart),
            text(
                "target-actual-benefits-table-desc-project",
                texts.targetVsActualBenefitsTableDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            text(
                "target-actual-people-table-desc-project",
                texts.targetVsActualPeopleTableDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            viz(benefitsTable),
            viz(peopleTable),
            spacer(),
            text("line-charts-section-project", texts.lineChartsSectionText, fullWidth),
            text(
                "benefits-line-chart-desc-project",
                texts.benefitsLineChartDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            text(
                "people-line-chart-desc-project",
                texts.peopleLineChartDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            viz(benefitsLineChart),
            viz(peopleLineChart),
            spacer(),
            text(
                "gender-disaggregation-section-project",
                texts.genderDisaggregationSectionText,
                fullWidth
            ),
            text(
                "gender-trends-desc-project",
                texts.genderTrendsDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            text(
                "gender-overall-trends-desc-project",
                texts.genderOverallAndTrendsDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            viz(genderNewLineChart),
            viz(newOnlyLineChart),
            text(
                "male-only-trend-desc-project",
                texts.maleOnlyTrendDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            text(
                "female-only-trend-desc-project",
                texts.femaleOnlyTrendDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            viz(maleLineChart),
            viz(femaleLineChart),
            text(
                "male-line-column-desc-project",
                texts.maleLineColumnDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            text(
                "female-line-column-desc-project",
                texts.femaleLineColumnDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            viz(maleLineColumn),
            viz(femaleLineColumn),
            spacer(),
            text("achieved-to-date-section-project", texts.achievedToDateSectionText, fullWidth),
            text(
                "achieved-benefits-table-desc-project",
                texts.achievedBenefitsTableDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            text(
                "achieved-people-table-desc-project",
                texts.achievedPeopleTableDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            viz(achievedBenefitsToDate),
            viz(achievedPeopleToDate),
            text(
                "achieved-benefit-chart-desc-project",
                texts.achievedBenefitChartDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            text(
                "achieved-people-chart-desc-project",
                texts.achievedPeopleChartDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            viz(achievedBenefitChartViz),
            viz(achievedPeopleChartViz),
            text(
                "gender-achievement-desc-project",
                texts.genderAchievementDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            text(
                "cost-benefit-desc-project",
                texts.costBenefitDescription,
                halfWidth,
                MAX_TEXT_HEIGHT
            ),
            viz(genderChartViz),
            viz(costBenefitTableViz),
        ]);

        const visualizations = _.compact([
            merBenefitsChart,
            merPeopleChart,
            benefitsTable,
            peopleTable,
            benefitsLineChart,
            peopleLineChart,
            genderNewLineChart,
            newOnlyLineChart,
            maleLineChart,
            femaleLineChart,
            maleLineColumn,
            femaleLineColumn,
            achievedBenefitsToDate,
            achievedPeopleToDate,
            achievedBenefitChartViz,
            achievedPeopleChartViz,
            genderChartViz,
            costBenefitTableViz,
        ]) as D2Visualization[];

        return { dashboardItemsToSave, visualizations };
    }

    getAwardNumberVisualizations(): PartialPersistedModel<D2Visualization>[] {
        return _.compact([
            this.awardNumberTargetVsActualPeoplePivotTable(),
            this.awardNumberTargetVsActualPeopleColumnChart(),
            this.awardNumberTargetVsActualBenefitsPivotTable(),
            this.awardNumberTargetVsActualBenefitsColumnChart(),
            this.achievedPeopleTotalTable({ toDate: true }),
            this.achievedBenefitsTable({ toDate: true }),
            this.targetVsActualPeopleTable(),
            this.targetVsActualBenefitsTable(),
            this.awardNumberTargetVsActualPeopleMonthByMonthTable(),
            this.awardNumberTargetVsActualBenefitsMonthByMonthTable(),
            this.awardNumberTargetVsActualPeopleMaleOnlyPivotTable(),
            this.awardNumberTargetVsActualPeopleMaleOnlyColumnChart(),
            this.awardNumberTargetVsActualPeopleFemaleOnlyPivotTable(),
            this.awardNumberTargetVsActualPeopleFemaleOnlyColumnChart(),
        ]);
    }

    targetVsActualBenefitsTable(): MaybeD2Visualization {
        const { config, dataElements } = this;
        const dataElementsNoDisaggregated = dataElements.benefit.filter(
            de => !de.categories.includes("newRecurring")
        );

        return this.getD2VisualizationFromDefinition({
            type: "table",
            key: "reportTable-target-actual-benefits",
            name: i18n.t("Target vs Actual - Benefits"),
            items: dataElementItems(dataElementsNoDisaggregated),
            filters: [dimensions.orgUnit],
            columns: [dimensions.period],
            rows: [dimensions.data, config.categories.targetActual],
        });
    }

    awardNumberTargetVsActualBenefitsPivotTable(): MaybeD2Visualization {
        const { config, dataElements } = this;
        const dataElementsNoDisaggregated = dataElements.benefit.filter(
            de => !de.categories.includes("newRecurring")
        );

        return this.getD2VisualizationFromDefinition({
            type: "table",
            key: "reportTable-target-actual-benefits-pivot-table",
            name: i18n.t("Target vs Actual - Benefits - Pivot Table"),
            periodStrategy: "yearly",
            items: dataElementItems(dataElementsNoDisaggregated),
            filters: [dimensions.orgUnit],
            columns: [dimensions.period],
            rows: [dimensions.data, config.categories.targetActual],
        });
    }

    awardNumberTargetVsActualBenefitsColumnChart(): MaybeD2Visualization {
        const { config, dataElements } = this;
        const dataElementsNoDisaggregated = dataElements.benefit.filter(
            de => !de.categories.includes("newRecurring")
        );

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            key: "chart-target-actual-benefits-award-number",
            name: i18n.t("Target vs Actual - Benefits - Column Chart"),
            periodStrategy: "yearly",
            items: dataElementItems(dataElementsNoDisaggregated),
            filters: [dimensions.orgUnit],
            columns: [dimensions.data],
            rows: [config.categories.targetActual, dimensions.period],
        });
    }

    awardNumberTargetVsActualPeopleColumnChart(): MaybeD2Visualization {
        const { config, dataElements } = this;

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            key: "chart-target-actual-people-award-number",
            name: i18n.t("Target vs Actual - People - Column Chart"),
            periodStrategy: "yearly",
            items: dataElementItems(dataElements.people),
            filters: [dimensions.orgUnit, config.categories.gender, config.categories.newRecurring],
            columns: [dimensions.data],
            rows: [config.categories.targetActual, dimensions.period],
        });
    }

    merTargetVsActualBenefitsChart(): MaybeD2Visualization {
        const { config, merDataElements } = this;
        const dataElementsNoDisaggregated = _(merDataElements.all)
            .filter(de => !de.categories.includes("newRecurring"))
            .sortBy(de => de.code)
            .value();

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            key: "chart-mer-target-actual-benefits",
            name: i18n.t("MER - Target vs Actual - Benefits - Column Chart"),
            items: dataElementItems(dataElementsNoDisaggregated),
            filters: [dimensions.orgUnit],
            columns: [dimensions.data],
            rows: [dimensions.period, config.categories.targetActual],
        });
    }

    merTargetVsActualPeopleChart(): MaybeD2Visualization {
        const { config, merDataElements } = this;

        const sortedItems = _(merDataElements.people)
            .sortBy(de => de.code)
            .value();

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            key: "chart-mer-target-actual-people",
            name: i18n.t("MER - Target vs Actual - People - Column Chart"),
            items: dataElementItems(sortedItems),
            filters: [dimensions.orgUnit, config.categories.gender, config.categories.newRecurring],
            columns: [dimensions.data],
            rows: [dimensions.period, config.categories.targetActual],
        });
    }

    targetVsActualBenefitsLineChart(): MaybeD2Visualization {
        const { config, dataElements } = this;
        const dataElementsNoDisaggregated = dataElements.benefit.filter(
            de => !de.categories.includes("newRecurring")
        );

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            chartType: "LINE",
            key: "chart-target-actual-benefits-line",
            name: i18n.t("Target vs Actual - Benefits - Line Chart"),
            items: dataElementItems(dataElementsNoDisaggregated),
            filters: [dimensions.orgUnit],
            columns: [config.categories.targetActual],
            rows: [dimensions.data, dimensions.period],
        });
    }

    targetVsActualPeopleLineChart(): MaybeD2Visualization {
        const { config, dataElements } = this;

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            chartType: "LINE",
            key: "chart-target-actual-people-line",
            name: i18n.t("Target vs Actual - People - Line Chart"),
            items: dataElementItems(dataElements.people),
            filters: [dimensions.orgUnit, config.categories.gender, config.categories.newRecurring],
            columns: [config.categories.targetActual],
            rows: [dimensions.data, dimensions.period],
        });
    }

    targetVsActualPeopleLineChartMaleOnly(): MaybeD2Visualization {
        const { config, dataElements } = this;

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            chartType: "LINE",
            key: "chart-target-actual-people-line-male-only",
            name: i18n.t("Target vs Actual - People - Line Chart - Male Only"),
            items: dataElementItems(dataElements.people),
            filters: [dimensions.orgUnit, this.categoryOnlyMale, config.categories.newRecurring],
            columns: [config.categories.targetActual],
            rows: [dimensions.data, dimensions.period],
        });
    }

    targetVsActualPeopleLineChartGenderNewOnly(): MaybeD2Visualization {
        const { config, dataElements } = this;

        const sortedDe = _(dataElements.people)
            .sortBy(de => de.code)
            .value();

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            chartType: "LINE",
            key: "chart-target-actual-people-line-gender-new",
            name: i18n.t("Target vs Actual - People - Line Chart - Gender New Only"),
            items: dataElementItems(sortedDe),
            filters: [dimensions.orgUnit, this.categoryOnlyNew, dimensions.period],
            columns: [config.categories.gender],
            rows: [config.categories.targetActual, dimensions.data],
        });
    }

    targetVsActualPeopleLineChartNewOnly(): MaybeD2Visualization {
        const { config, dataElements } = this;

        const sortedDe = _(dataElements.people)
            .sortBy(de => de.code)
            .value();

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            chartType: "LINE",
            key: "chart-target-actual-people-line-new-only",
            name: i18n.t("Target vs Actual - People - Line Chart - New Only"),
            items: dataElementItems(sortedDe),
            filters: [dimensions.orgUnit, this.categoryOnlyNew, dimensions.period],
            columns: [config.categories.targetActual],
            rows: [config.categories.gender, dimensions.data],
            extra: {
                series: [
                    { dimensionItem: config.categoryOptions.target.id, axis: 0 },
                    {
                        dimensionItem: config.categoryOptions.actual.id,
                        axis: 0,
                        type: "COLUMN",
                    },
                ],
            },
        });
    }

    targetVsActualPeopleLineChartFemaleOnly(): MaybeD2Visualization {
        const { config, dataElements } = this;

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            chartType: "LINE",
            key: "chart-target-actual-people-line-female-only",
            name: i18n.t("Target vs Actual - People - Line Chart - Female Only"),
            items: dataElementItems(dataElements.people),
            filters: [dimensions.orgUnit, this.categoryOnlyFemale, config.categories.newRecurring],
            columns: [config.categories.targetActual],
            rows: [dimensions.data, dimensions.period],
        });
    }

    targetVsActualPeopleLineColumnChartMaleOnly(): MaybeD2Visualization {
        const { config, dataElements } = this;

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            chartType: "LINE",
            key: "chart-target-actual-people-line-column-male-only",
            name: i18n.t("Target vs Actual - People - Line/Column Chart - Male Only"),
            items: dataElementItems(dataElements.people),
            filters: [dimensions.orgUnit, this.categoryOnlyMale, config.categories.newRecurring],
            columns: [config.categories.targetActual],
            rows: [dimensions.data, dimensions.period],
            extra: {
                series: [
                    { dimensionItem: config.categoryOptions.target.id, axis: 0 },
                    {
                        dimensionItem: config.categoryOptions.actual.id,
                        axis: 0,
                        type: "COLUMN",
                    },
                ],
            },
        });
    }

    targetVsActualPeopleLineColumnChartFemaleOnly(): MaybeD2Visualization {
        const { config, dataElements } = this;

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            chartType: "LINE",
            key: "chart-target-actual-people-line-column-female-only",
            name: i18n.t("Target vs Actual - People - Line/Column Chart - Female Only"),
            items: dataElementItems(dataElements.people),
            filters: [dimensions.orgUnit, this.categoryOnlyFemale, config.categories.newRecurring],
            columns: [config.categories.targetActual],
            rows: [dimensions.data, dimensions.period],
            extra: {
                series: [
                    { dimensionItem: config.categoryOptions.target.id, axis: 0 },
                    {
                        dimensionItem: config.categoryOptions.actual.id,
                        axis: 0,
                        type: "COLUMN",
                    },
                ],
            },
        });
    }

    targetVsActualBenefitsWithDisaggregationTable(): MaybeD2Visualization {
        const { config, dataElements } = this;
        const dataElementsDisaggregated = dataElements.benefit.filter(de =>
            de.categories.includes("newRecurring")
        );

        return this.getD2VisualizationFromDefinition({
            type: "table",
            key: "reportTable-target-actual-benefits-disaggregated",
            name: i18n.t("Target vs Actual - Benefits (Disaggregated)"),
            items: dataElementItems(dataElementsDisaggregated),
            filters: [dimensions.orgUnit],
            columns: [dimensions.period],
            rows: [dimensions.data, config.categories.targetActual, config.categories.newRecurring],
        });
    }

    targetVsActualPeopleTable(): MaybeD2Visualization {
        const { config, dataElements } = this;

        return this.getD2VisualizationFromDefinition({
            type: "table",
            key: "reportTable-target-actual-people",
            name: i18n.t("Target vs Actual - People"),
            items: dataElementItems(dataElements.people),
            filters: [dimensions.orgUnit],
            columns: [dimensions.period, config.categories.gender],
            rows: [dimensions.data, config.categories.targetActual, config.categories.newRecurring],
        });
    }

    awardNumberTargetVsActualPeoplePivotTable(): MaybeD2Visualization {
        const { config, dataElements } = this;

        return this.getD2VisualizationFromDefinition({
            type: "table",
            key: "reportTable-target-actual-people-pivot-table",
            name: i18n.t("Target vs Actual - People - Pivot Table"),
            periodStrategy: "yearly",
            items: dataElementItems(dataElements.people),
            filters: [dimensions.orgUnit],
            columns: [dimensions.period],
            rows: [dimensions.data, config.categories.targetActual, config.categories.newRecurring],
        });
    }

    awardNumberTargetVsActualPeopleMonthByMonthTable(): MaybeD2Visualization {
        const { config, dataElements } = this;

        return this.getD2VisualizationFromDefinition({
            type: "table",
            key: "reportTable-target-actual-people-month-by-month",
            name: i18n.t("Target vs Actual - People - Month by Month"),
            periodStrategy: "monthly_interleaved_by_month",
            items: dataElementItems(dataElements.people),
            filters: [dimensions.orgUnit, config.categories.gender, config.categories.newRecurring],
            columns: [dimensions.period],
            rows: [dimensions.data, config.categories.targetActual],
        });
    }

    awardNumberTargetVsActualBenefitsMonthByMonthTable(): MaybeD2Visualization {
        const { config, dataElements } = this;
        const dataElementsNoDisaggregated = dataElements.benefit.filter(
            de => !de.categories.includes("newRecurring")
        );

        return this.getD2VisualizationFromDefinition({
            type: "table",
            key: "reportTable-target-actual-benefits-month-by-month",
            name: i18n.t("Target vs Actual - Benefits - Month by Month"),
            periodStrategy: "monthly_interleaved_by_month",
            items: dataElementItems(dataElementsNoDisaggregated),
            filters: [dimensions.orgUnit],
            columns: [dimensions.period],
            rows: [dimensions.data, config.categories.targetActual],
        });
    }

    awardNumberTargetVsActualPeopleMaleOnlyPivotTable(): MaybeD2Visualization {
        return this.awardNumberTargetVsActualPeopleGenderPivotTable({
            key: "reportTable-target-actual-people-male-only-pivot-table",
            name: i18n.t("Target vs Actual - People - Male Only - Pivot Table"),
            genderFilter: this.categoryOnlyMale,
        });
    }

    awardNumberTargetVsActualPeopleFemaleOnlyPivotTable(): MaybeD2Visualization {
        return this.awardNumberTargetVsActualPeopleGenderPivotTable({
            key: "reportTable-target-actual-people-female-only-pivot-table",
            name: i18n.t("Target vs Actual - People - Female Only - Pivot Table"),
            genderFilter: this.categoryOnlyFemale,
        });
    }

    awardNumberTargetVsActualPeopleMaleOnlyColumnChart(): MaybeD2Visualization {
        return this.awardNumberTargetVsActualPeopleGenderColumnChart({
            key: "chart-target-actual-people-male-only-award-number",
            name: i18n.t("Target vs Actual - People - Male Only - Column Chart"),
            genderFilter: this.categoryOnlyMale,
        });
    }

    awardNumberTargetVsActualPeopleFemaleOnlyColumnChart(): MaybeD2Visualization {
        return this.awardNumberTargetVsActualPeopleGenderColumnChart({
            key: "chart-target-actual-people-female-only-award-number",
            name: i18n.t("Target vs Actual - People - Female Only - Column Chart"),
            genderFilter: this.categoryOnlyFemale,
        });
    }

    awardNumberTargetVsActualPeopleGenderPivotTable(options: {
        key: string;
        name: string;
        genderFilter: { id: Id; categoryOptions: Ref[] };
    }): MaybeD2Visualization {
        const { config, dataElements } = this;
        const { key, name, genderFilter } = options;

        return this.getD2VisualizationFromDefinition({
            type: "table",
            key,
            name,
            periodStrategy: "yearly",
            items: dataElementItems(dataElements.people),
            filters: [dimensions.orgUnit, genderFilter, this.categoryOnlyNew],
            columns: [dimensions.period],
            rows: [dimensions.data, config.categories.targetActual],
        });
    }

    awardNumberTargetVsActualPeopleGenderColumnChart(options: {
        key: string;
        name: string;
        genderFilter: { id: Id; categoryOptions: Ref[] };
    }): MaybeD2Visualization {
        const { config, dataElements } = this;
        const { key, name, genderFilter } = options;

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            key,
            name,
            periodStrategy: "yearly",
            items: dataElementItems(dataElements.people),
            filters: [dimensions.orgUnit, genderFilter, this.categoryOnlyNew],
            columns: [dimensions.period],
            rows: [dimensions.data, config.categories.targetActual],
        });
    }

    targetVsActualUniquePeopleTable(): MaybeD2Visualization {
        const { config, dataElements } = this;

        return this.getD2VisualizationFromDefinition({
            type: "table",
            key: "reportTable-target-actual-unique-people",
            name: i18n.t("Target vs Actual - Unique People"),
            items: dataElementItems(dataElements.people),
            filters: [dimensions.orgUnit, this.categoryOnlyNew],
            columns: [dimensions.period, config.categories.gender],
            rows: [dimensions.data, config.categories.targetActual],
        });
    }

    achievedBenefitsTable(options: VisualizationOptions = {}): MaybeD2Visualization {
        const { config, dataElements } = this;
        const indicators = getActualTargetIndicators(config, dataElements.benefit);

        return this.getD2VisualizationFromDefinition({
            type: "table",
            key: "reportTable-indicators-benefits" + (options.toDate ? "-todate" : ""),
            name: options.toDate
                ? i18n.t("Achieved to date (%) - Benefits")
                : i18n.t("Achieved (%) - Benefits"),
            items: indicatorItems(indicators),
            filters: [dimensions.orgUnit],
            columns: [dimensions.period],
            rows: [dimensions.data],
            extra: { legendSet: config.legendSets.achieved },
            ...options,
        });
    }

    achievedPeopleTable(): MaybeD2Visualization {
        const { config, dataElements } = this;
        const indicators = getActualTargetIndicators(this.config, dataElements.people);

        return this.getD2VisualizationFromDefinition({
            type: "table",
            key: "reportTable-indicators-people",
            name: i18n.t("Achieved to date (%) - People"),
            items: indicatorItems(indicators),
            filters: [dimensions.orgUnit],
            columns: [dimensions.period],
            rows: [dimensions.data],
            extra: { legendSet: config.legendSets.achieved },
            rowTotals: false,
        });
    }

    achievedPeopleTotalTable(options: VisualizationOptions = {}): MaybeD2Visualization {
        const { config, dataElements } = this;

        return this.getD2VisualizationFromDefinition({
            type: "table",
            key: "reportTable-indicators-people-total" + (options.toDate ? "-todate" : ""),
            name: options.toDate
                ? i18n.t("Achieved total to date (%) - People")
                : i18n.t("Achieved total (%) - People"),
            items: indicatorItems(getActualTargetIndicators(this.config, dataElements.people)),
            filters: [dimensions.orgUnit, dimensions.period],
            columns: [this.categoryOnlyNew],
            rows: [dimensions.data],
            extra: { legendSet: config.legendSets.achieved },
            rowTotals: false,
            ...options,
        });
    }

    achievedBenefitsTotalToDateTable(): MaybeD2Visualization {
        const { config, dataElements } = this;

        const dataElementsDisaggregated = dataElements.benefit.filter(de =>
            de.categories.includes("newRecurring")
        );

        return this.getD2VisualizationFromDefinition({
            type: "table",
            key: "reportTable-indicators-benefits-total-todate",
            name: i18n.t("Achieved total to date (%) - Benefits (Disaggregated)"),
            items: indicatorItems(
                getActualTargetIndicators(this.config, dataElementsDisaggregated)
            ),
            filters: [dimensions.orgUnit, dimensions.period],
            columns: [this.categoryOnlyNew],
            rows: [dimensions.data],
            extra: { legendSet: config.legendSets.achieved },
            rowTotals: false,
        });
    }

    achievedMonthlyChart(): MaybeD2Visualization {
        const { config, dataElements } = this;

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            key: "chart-achieved-monthly",
            name: i18n.t("Achieved monthly (%)"),
            items: indicatorItems(getActualTargetIndicators(config, dataElements.all)),
            filters: [dimensions.orgUnit],
            columns: [dimensions.period],
            rows: [dimensions.data],
        });
    }

    achievedBenefitChart(): MaybeD2Visualization {
        const { config, dataElements } = this;

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            key: "chart-achieved",
            name: i18n.t("Achieved Benefit (%)"),
            items: indicatorItems(getActualTargetIndicators(config, dataElements.benefit)),
            filters: [dimensions.period],
            columns: [dimensions.orgUnit],
            rows: [dimensions.data],
        });
    }

    achievedPeopleChart(): MaybeD2Visualization {
        const { config, dataElements } = this;

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            key: "chart-people-achieved",
            name: i18n.t("Achieved People (%)"),
            items: indicatorItems(getActualTargetIndicators(config, dataElements.people)),
            filters: [dimensions.period, this.categoryOnlyNew],
            columns: [dimensions.orgUnit],
            rows: [dimensions.data],
        });
    }

    genderChart(): MaybeD2Visualization {
        const { config, dataElements } = this;

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            key: "chart-achieved-gender",
            name: i18n.t("Achieved by gender (%)"),
            items: indicatorItems(getActualTargetIndicators(config, dataElements.people)),
            filters: [dimensions.orgUnit, dimensions.period, this.categoryOnlyNew],
            columns: [config.categories.gender],
            rows: [dimensions.data],
        });
    }

    costBenefitTable(): MaybeD2Visualization {
        const { config, dataElements } = this;

        const pairedDataElements = dataElements.benefit.filter(de => de.hasPairedDataElements);

        return this.getD2VisualizationFromDefinition({
            type: "chart",
            key: "cost-benefit",
            name: i18n.t("Benefits Per Person"),
            items: indicatorItems(getCostBenefitIndicators(config, pairedDataElements)),
            filters: [dimensions.period],
            columns: [dimensions.orgUnit],
            rows: [dimensions.data],
        });
    }

    getD2VisualizationFromDefinition(definition: VisualizationDefinition): MaybeD2Visualization {
        const { config, projectsListDashboard } = this;

        const visualization: Visualization = {
            ...definition,
            key: definition.key + projectsListDashboard.id,
            name: `${projectsListDashboard.name} - ${definition.name}`,
            organisationUnits: projectsListDashboard.orgUnits,
            periods: getVisualizationPeriods(projectsListDashboard.periods, definition),
            sharing: new ProjectSharing(
                config,
                projectsListDashboard
            ).getSharingAttributesForDashboard(),
        };

        const d2Visualization = getD2Visualization(visualization);

        return d2Visualization ? { ...d2Visualization, ...visualization.extra } : null;
    }
}

interface Dashboard {
    id: Id;
    name: string;
}

export async function getProjectDashboard(
    api: D2Api,
    config: Config,
    projectId: Id
): Promise<Response<Dashboard>> {
    const project = await Project.get(api, config, projectId).catch(_err => null);
    if (!project) return { type: "error" as const, message: "No dashboard found" };

    // Regenerate the dashboard, as it contains "to date" visualizations
    const metadata = (await ProjectDashboard.buildForProject(api, config, project)).generate();
    const dashboard = metadata.dashboards[0];
    if (!dashboard) return { type: "error", message: "Error generating dashboard" };

    const response = await api.metadata
        .post(metadata)
        .getData()
        .catch(_err => null);
    const newDashboard = { id: dashboard.id, name: project.name };
    const updateSuccessful = response && response.status === "OK";

    if (!updateSuccessful) {
        console.error("Error saving dashboard", response);

        if (project.dashboard.project) {
            // There was an error saving the updated dashboard, but an old one existed, return it.
            return { type: "success", data: project.dashboard.project };
        } else {
            return { type: "error", message: i18n.t("Error saving dashboard") };
        }
    } else {
        return { type: "success", data: newDashboard };
    }
}

export async function getAwardNumberDashboard(
    api: D2Api,
    config: Config,
    projectId: Id
): Promise<Response<Dashboard>> {
    const project = await Project.get(api, config, projectId).catch(_err => null);

    if (!project) {
        return { type: "error" as const, message: "No dashboard found" };
    } else {
        const { awardNumber } = project;
        const generator = await ProjectDashboard.buildForAwardNumber(api, config, awardNumber);
        const metadata = generator.generate({ minimumOrgUnits: 2 });
        const dashboard = metadata.dashboards[0];
        if (!dashboard) return { type: "error", message: "Error generating dashboard" };

        const response = await api.metadata
            .post(metadata)
            .getData()
            .catch(_err => null);
        const newDashboard = { id: dashboard.id, name: dashboard.name };
        const updateSuccessful = response && response.status === "OK";

        if (!updateSuccessful) {
            return { type: "error", message: i18n.t("Error saving dashboard") };
        } else {
            return { type: "success", data: newDashboard };
        }
    }
}

interface VisualizationOptions {
    toDate?: boolean;
}
