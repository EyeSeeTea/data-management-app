import { Id } from "../../domain/entities/Ref";
import { ProjectRepository } from "../../domain/repositories/ProjectRepository";
import { Config } from "../../models/Config";
import Project from "../../models/Project";
import { D2Api } from "../../types/d2-api";

export class ProjectD2Repository implements ProjectRepository {
    constructor(private api: D2Api, private config: Config) {}

    async getById(id: Id): Promise<Project> {
        return Project.get(this.api, this.config, id);
    }
}
