import { D2Api, Id } from "../types/d2-api";
import { ProjectStatus } from "../domain/entities/ProjectStatus";
import {
    GetProjectStatusOptions,
    ProjectStatusRepository,
} from "../domain/repositories/ProjectStatusRepository";
import { Config } from "../models/Config";
import { D2ApiProject } from "./common/D2ApiProject";
import { Period } from "../models/Period";

export class ProjectStatusD2Repository implements ProjectStatusRepository {
    private d2ApiProject: D2ApiProject;

    constructor(private api: D2Api, private config: Config) {
        this.d2ApiProject = new D2ApiProject(api, config);
    }

    async getBy(options: GetProjectStatusOptions): Promise<ProjectStatus[]> {
        const { projectId, dataSetType } = options;
        const project = await this.d2ApiProject.getById(projectId);
        const dataSet = project.dataSets ? project.dataSets[dataSetType] : undefined;
        const orgUnit = project.orgUnit;
        if (!dataSet || !orgUnit) {
            throw new Error("Data set or Org. unit not found for the project");
        }

        const categoryOption = this.config.categoryOptions[dataSetType];

        const aoc = categoryOption.categoryOptionCombos[0];
        if (!aoc) throw new Error("Cannot get attribute option combo");

        const path = "/dataApprovals/approvals";

        const params = {
            wf: this.config.dataApprovalWorkflows.project.id,
            startDate: project.startDate?.toISOString(),
            endDate: project.endDate?.toISOString(),
            ou: orgUnit.id,
            aoc: aoc.id,
        };

        const dataApprovalsAll = await this.api.get<D2DataApprovals[]>(path, params).getData();

        return dataApprovalsAll.map(approval => {
            return ProjectStatus.create({
                status: approval.state.includes("UNAPPRO") ? "unapproved" : "approved",
                period: approval.pe,
                projectId: project.id,
            });
        });
    }
}

type D2DataApprovals = {
    pe: Period;
    ou: Id;
    state: WORKFLOW_STATE;
};

type WORKFLOW_STATE =
    | "UNAPPROVABLE"
    | "UNAPPROVED_WAITING"
    | "UNAPPROVED_ELSEWHERE"
    | "UNAPPROVED_READY"
    | "APPROVED_HERE"
    | "APPROVED_ELSEWHERE"
    | "ACCEPTED_HERE"
    | "ACCEPTED_ELSEWHERE";
