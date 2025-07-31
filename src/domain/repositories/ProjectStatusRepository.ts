import { DataSetType } from "../../models/Project";
import { ProjectStatus } from "../entities/ProjectStatus";
import { Id } from "../entities/Ref";

export interface ProjectStatusRepository {
    getBy(options: GetProjectStatusOptions): Promise<ProjectStatus[]>;
}

export type GetProjectStatusOptions = {
    projectId: Id;
    dataSetType: DataSetType;
};
