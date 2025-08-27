import { DataSetType } from "../../models/Project";
import { ProjectStatus } from "../entities/ProjectStatus";
import { Id } from "../entities/Ref";
import { ProjectStatusRepository } from "../repositories/ProjectStatusRepository";

export class GetProjectStatusesUseCase {
    constructor(private projectStatusRepository: ProjectStatusRepository) {}

    async execute(options: UseCaseOptions): Promise<ProjectStatus[]> {
        const { projectId, dataSetType } = options;
        return this.projectStatusRepository.getBy({
            projectId,
            dataSetType,
        });
    }
}

type UseCaseOptions = {
    projectId: Id;
    dataSetType: DataSetType;
};
