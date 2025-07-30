import _ from "lodash";
import { Period } from "../../models/Period";
import { Struct } from "./generic/Struct";
import { Id } from "./Ref";

type ProjectStatusAttrs = {
    period: Period;
    projectId: Id;
    status: "approved" | "unapproved";
};

export class ProjectStatus extends Struct<ProjectStatusAttrs>() {
    get isUnapproved(): boolean {
        return this.status === "unapproved";
    }

    static getLastUnapprovedPeriod(statuses: ProjectStatus[], period: Period): Period {
        const previousPeriods = statuses
            .filter(status => status.status === "unapproved")
            .map(status => Number(status.period));

        const unapprovedPeriod = _(previousPeriods)
            .sort()
            .filter(item => item <= Number(period))
            .last();

        return unapprovedPeriod ? String(unapprovedPeriod) : period;
    }
}
