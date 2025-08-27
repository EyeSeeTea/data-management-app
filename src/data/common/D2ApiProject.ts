import { ProjectCountry } from "../../domain/entities/IndicatorReport";
import { Config } from "../../models/Config";
import Project, { getDatesFromOrgUnit } from "../../models/Project";
import { ProjectForList } from "../../models/ProjectsList";
import { D2Api, Id } from "../../types/d2-api";

export class D2ApiProject {
    constructor(private api: D2Api, private config: Config) {}

    async getByIds(ids: string[]): Promise<ProjectCountry[]> {
        if (ids.length === 0) return [];

        const response = await this.api.models.organisationUnits
            .get({
                fields: {
                    id: true,
                    code: true,
                    name: true,
                    displayName: true,
                    openingDate: true,
                    closedDate: true,
                },
                paging: false,
                filter: { id: { in: ids } },
            })
            .getData();

        return response.objects.map((d2OrgUnit): ProjectCountry => {
            const { startDate, endDate } = getDatesFromOrgUnit(d2OrgUnit);
            return {
                closedDate: endDate?.toISOString() || "",
                id: d2OrgUnit.id,
                name: d2OrgUnit.displayName,
                openingDate: startDate?.toISOString() || "",
            };
        });
    }

    async getById(id: string): Promise<Project> {
        return Project.get(this.api, this.config, id);
    }

    async getAllProjectsByCountry(
        countryId: Id,
        initialPage: number,
        initialProjects: ProjectForList[]
    ) {
        const response = await this.getByCountry(countryId, initialPage);
        const newProjects = [...initialProjects, ...response.objects];
        if (response.pager.page >= response.pager.pageCount) {
            return newProjects;
        } else {
            const projects = await this.getByCountry(countryId, initialPage + 1);
            return projects.objects;
        }
    }

    private getByCountry(countryId: Id, page: number) {
        return Project.getList(
            this.api,
            this.config,
            { countryIds: [countryId] },
            { field: "created", order: "desc" },
            { page: page, pageSize: 50 }
        );
    }
}
