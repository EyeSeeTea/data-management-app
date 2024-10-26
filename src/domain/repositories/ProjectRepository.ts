import Project from "../../models/Project";
import { Id } from "../entities/Ref";

export interface ProjectRepository {
    getById(id: Id): Promise<Project>;
}
