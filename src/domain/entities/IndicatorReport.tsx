import { ProjectForList } from "../../models/ProjectsList";
import { Maybe } from "../../types/utils";
import { Struct } from "./generic/Struct";
import { Code, Id, ISODateTimeString } from "./Ref";
import { UniqueBeneficiariesPeriod } from "./UniqueBeneficiariesPeriod";

export type IndicatorReportAttrs = {
    period: UniqueBeneficiariesPeriod;
    countryId: Id;
    createdAt: ISODateTimeString;
    lastUpdatedAt: ISODateTimeString;
    projects: ProjectRows[];
};

export type IndicatorReportToSave = Omit<IndicatorReportAttrs, "createdAt" | "lastUpdatedAt">;

export type ProjectRows = {
    id: Id;
    project: ProjectCountry;
    indicators: ProjectIndicatorRow[];
};

export type ProjectCountry = Pick<ProjectForList, "id" | "name" | "openingDate" | "closedDate">;

export type ProjectIndicatorRow = {
    indicatorId: Id;
    indicatorCode: Code;
    indicatorName: string;
    value: Maybe<number>;
    include: boolean;
    periodNotAvailable: boolean;
};

export class IndicatorReport extends Struct<IndicatorReportAttrs>() {
    updateProjectIndicators(projectId: Id, indicatorId: Id, include: boolean): IndicatorReport {
        const newProjects = this.projects.map(project => {
            if (project.id !== projectId) return project;

            return project.id === projectId
                ? {
                      ...project,
                      indicators: this.updateIndicators(project, indicatorId, include),
                  }
                : project;
        });
        return this._update({ projects: newProjects });
    }

    private updateIndicators(
        project: ProjectRows,
        indicatorId: Id,
        include: boolean
    ): ProjectIndicatorRow[] {
        return project.indicators.map(indicator =>
            indicator.indicatorId === indicatorId ? { ...indicator, include } : indicator
        );
    }

    static generateIndicatorFullName(indicator: ProjectIndicatorRow): string {
        return `${indicator.indicatorName} (${indicator.indicatorCode})`;
    }
}
