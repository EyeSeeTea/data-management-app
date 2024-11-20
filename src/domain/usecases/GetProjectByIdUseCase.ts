import Project from "../../models/Project";
import { Id } from "../entities/Ref";
import { ProjectRepository } from "../repositories/ProjectRepository";

export class GetProjectByIdUseCase {
    constructor(private projectRepository: ProjectRepository) {}

    execute(id: Id): Promise<Project> {
        return this.projectRepository.getById(id);
    }
}
