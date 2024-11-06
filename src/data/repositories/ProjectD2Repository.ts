import { Id } from "../../domain/entities/Ref";
import { ProjectRepository } from "../../domain/repositories/ProjectRepository";
import { Config } from "../../models/Config";
import Project from "../../models/Project";
import { ProjectForList } from "../../models/ProjectsList";
import { D2Api } from "../../types/d2-api";

export class ProjectD2Repository implements ProjectRepository {
    constructor(private api: D2Api, private config: Config) {}

    async getById(id: Id): Promise<Project> {
        return Project.get(this.api, this.config, id);
    }

    async getByCountries(countryId: Id): Promise<ProjectForList[]> {
        return this.getAllProjectsByCountry(countryId, 1, []);
    }

    private async getAllProjectsByCountry(
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
            { countryIds: [countryId], onlyActive: true },
            { field: "created", order: "desc" },
            { page: page, pageSize: 50 }
        );
    }
}
