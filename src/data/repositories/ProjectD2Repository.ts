import { Id } from "../../domain/entities/Ref";
import { ProjectRepository } from "../../domain/repositories/ProjectRepository";
import { Config } from "../../models/Config";
import Project from "../../models/Project";
import { ProjectForList } from "../../models/ProjectsList";
import { D2Api } from "../../types/d2-api";
import { D2ApiProject } from "../common/D2ApiProject";

export class ProjectD2Repository implements ProjectRepository {
    private d2ApiProject: D2ApiProject;

    constructor(private api: D2Api, private config: Config) {
        this.d2ApiProject = new D2ApiProject(this.api, this.config);
    }

    async getById(id: Id): Promise<Project> {
        return this.d2ApiProject.getById(id);
    }

    async getByCountries(countryId: Id): Promise<ProjectForList[]> {
        return this.d2ApiProject.getAllProjectsByCountry(countryId, 1, []);
    }
}
