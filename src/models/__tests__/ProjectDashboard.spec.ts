import _ from "lodash";
import config from "./config";
import ProjectDashboard from "../ProjectDashboard";
import { ProjectsListDashboard } from "../ProjectsListDashboard";

const user = { id: "M5zQapPyTZI", name: "admin admin" };
const userGroup = { id: "ywuI2WspUUG", name: "System Admin" };

const projectsListDashboard: ProjectsListDashboard = {
    id: "PJb0RtEnqlf",
    name: "12345en - MyProject",
    orgUnits: [{ id: "PJb0RtEnqlf" }],
    parentOrgUnit: { id: "J0hschZVMBt" },
    sharing: { userAccesses: [user], userGroupAccesses: [userGroup] },
    dates: undefined,
    periods: [],
    dataElements: { all: [], people: [], benefit: [] },
};

const expectedSharing = {
    public: "--------",
    external: false,
    users: { [user.id]: { id: user.id, displayName: user.name, access: "rw------" } },
    userGroups: {
        [userGroup.id]: { id: userGroup.id, displayName: userGroup.name, access: "rw------" },
    },
};

function generateDashboard(type: "project" | "awardNumber") {
    const { dashboards } = new ProjectDashboard(config, projectsListDashboard, type).generate();
    return dashboards[0];
}

describe("ProjectDashboard", () => {
    describe("generate", () => {
        it("gives the project dashboard the sharing of the project", () => {
            expect(_.get(generateDashboard("project"), "sharing")).toEqual(expectedSharing);
        });

        /* DHIS2 drops public, external, users and userGroups when they are sent at the top level,
           which leaves the dashboard readable only by its owner and by superusers. */
        it("keeps no sharing field at the top level of the project dashboard", () => {
            expect(Object.keys(generateDashboard("project")).sort()).toEqual([
                "dashboardItems",
                "id",
                "name",
                "sharing",
            ]);
        });

        it("gives the award number dashboard the same treatment", () => {
            expect(_.get(generateDashboard("awardNumber"), "sharing")).toEqual(expectedSharing);
        });
    });
});
