import Project from "../../models/Project";
import { ProjectForList } from "../../models/ProjectsList";
import { Id } from "../entities/Ref";

export interface ProjectRepository {
    getById(id: Id): Promise<Project>;
    getByCountries(countryId: Id): Promise<ProjectForList[]>;
}
