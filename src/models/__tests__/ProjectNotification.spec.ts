import _ from "lodash";

import { appConfig } from "../../app-config";
import { getMockApi, Id } from "../../types/d2-api";
import { Config } from "../Config";
import Project from "../Project";
import { ProjectNotification } from "../ProjectNotification";
import User from "../user";
import config from "./config";

const { api, mock } = getMockApi();

const period = "202401";
const dataSetId = "SdOUI2yT46H";
const dataSetType = "actual" as const;
const reviewerRoleId = "E5ZNGn2ive3";
const countryAdminGroupId = "sF8fYSlGLPO";
const otherGroupId = "mGK0RBQPqAr";
const emailPath = "/email/notification";
const metadataPath = "/metadata";

/* Users nested in userRoles are serialized by DHIS2 with basic fields only, no matter which fields
   are requested (see user_roles.json). */
type NestedUser = {
    id: Id;
    code: string | null;
    name: string;
    displayName: string;
    username: string;
};

type UserDetails = {
    id: Id;
    email?: string;
    userCredentials?: { disabled: boolean };
    userGroups: Array<{ id: Id }>;
};

type DataSetSharing = {
    id: Id;
    userAccesses: Array<{ id: Id }>;
    userGroupAccesses: Array<{ id: Id; displayName: string }>;
};

type ApiOptions = {
    reviewers: UserDetails[];
    dataSets?: DataSetSharing[];
    emailStatus?: number;
};

function getNestedUser(id: Id): NestedUser {
    return { id, code: null, name: id, displayName: id, username: id };
}

function getReviewer(id: Id, attributes: Partial<UserDetails> = {}): UserDetails {
    return {
        id,
        email: `${id}@example.com`,
        userCredentials: { disabled: false },
        userGroups: [],
        ...attributes,
    };
}

function getDataSetSharing(attributes: Partial<DataSetSharing> = {}): DataSetSharing {
    return { id: dataSetId, userAccesses: [], userGroupAccesses: [], ...attributes };
}

function getIdsFromFilter(filters: string[]): Id[] {
    const idFilter = filters.find(filter => filter.startsWith("id:in:")) || "";
    const ids = idFilter.match(/^id:in:\[(.*)\]$/)?.[1] || "";
    return _.compact(ids.split(","));
}

/* Returns the id filters used on each users request, so tests can assert that details are only
   requested for the reviewers, in chunks. */
function setupApi(options: ApiOptions): { userRequests: Id[][] } {
    const { reviewers, dataSets = [getDataSetSharing()], emailStatus = 200 } = options;
    const userRequests: Id[][] = [];
    mock.reset();

    mock.onGet(metadataPath).reply(requestConfig => {
        const params = requestConfig.params;

        if (params["users:filter"]) {
            const ids = getIdsFromFilter(params["users:filter"]);
            userRequests.push(ids);
            return [200, { users: reviewers.filter(reviewer => ids.includes(reviewer.id)) }];
        }

        return [
            200,
            {
                userRoles: [
                    { id: reviewerRoleId, users: reviewers.map(({ id }) => getNestedUser(id)) },
                ],
                dataSets,
            },
        ];
    });

    mock.onPost(emailPath).reply(emailStatus, {});

    return { userRequests };
}

function getNotificator(): ProjectNotification {
    const project = Project.create(api, config)
        .set("id", "BvNo8zQaol8")
        .set("name", "Project name");
    const currentUser = new User({
        ...config,
        currentUser: { ...config.currentUser, userRoles: [{ name: "DM Data Entry" }] },
    } as Config);

    return new ProjectNotification(api, project, currentUser, true);
}

function notifyForDataReview(): Promise<boolean> {
    return getNotificator().notifyForDataReview(period, dataSetId, dataSetType);
}

function getSentRecipients(): string[] | undefined {
    const request = _.last(mock.history.post);
    return request?.params?.recipients;
}

describe("ProjectNotification.notifyForDataReview", () => {
    it("sends the email to reviewers shared with the data set, even though the API returns no details for nested users", async () => {
        const reviewer = getReviewer("reviewer1");
        setupApi({
            reviewers: [reviewer, getReviewer("notShared")],
            dataSets: [getDataSetSharing({ userAccesses: [{ id: reviewer.id }] })],
        });

        const emailSent = await notifyForDataReview();

        expect(emailSent).toBe(true);
        expect(getSentRecipients()).toEqual(["reviewer1@example.com"]);
    });

    it("requests the details only for the users of the data reviewer role", async () => {
        const { userRequests } = setupApi({
            reviewers: [getReviewer("reviewer1"), getReviewer("reviewer2")],
        });

        await notifyForDataReview();

        expect(userRequests).toEqual([["reviewer1", "reviewer2"]]);
    });

    it("requests the details in chunks of 100 users", async () => {
        const reviewers = _.range(250).map(index => getReviewer(`reviewer${index}`));
        const { userRequests } = setupApi({
            reviewers,
            dataSets: [getDataSetSharing({ userAccesses: [{ id: "reviewer249" }] })],
        });

        const emailSent = await notifyForDataReview();

        expect(userRequests.map(ids => ids.length)).toEqual([100, 100, 50]);
        expect(emailSent).toBe(true);
        expect(getSentRecipients()).toEqual(["reviewer249@example.com"]);
    });

    it("sends the email to reviewers in a country admin group shared with the data set", async () => {
        setupApi({
            reviewers: [
                getReviewer("countryAdmin", { userGroups: [{ id: countryAdminGroupId }] }),
                getReviewer("otherGroup", { userGroups: [{ id: otherGroupId }] }),
            ],
            dataSets: [
                getDataSetSharing({
                    userGroupAccesses: [
                        { id: countryAdminGroupId, displayName: "Country Admin Armenia" },
                        { id: otherGroupId, displayName: "Data Viewers" },
                    ],
                }),
            ],
        });

        await notifyForDataReview();

        expect(getSentRecipients()).toEqual(["countryAdmin@example.com"]);
    });

    it("excludes disabled reviewers", async () => {
        setupApi({
            reviewers: [
                getReviewer("enabled"),
                getReviewer("disabled", { userCredentials: { disabled: true } }),
            ],
            dataSets: [
                getDataSetSharing({ userAccesses: [{ id: "enabled" }, { id: "disabled" }] }),
            ],
        });

        await notifyForDataReview();

        expect(getSentRecipients()).toEqual(["enabled@example.com"]);
    });

    it("excludes reviewers whose disabled flag is not returned by the API", async () => {
        setupApi({
            reviewers: [
                getReviewer("known"),
                getReviewer("unknownStatus", { userCredentials: undefined }),
            ],
            dataSets: [
                getDataSetSharing({
                    userAccesses: [{ id: "known" }, { id: "unknownStatus" }],
                }),
            ],
        });

        await notifyForDataReview();

        expect(getSentRecipients()).toEqual(["known@example.com"]);
    });

    it("skips reviewers without email", async () => {
        setupApi({
            reviewers: [getReviewer("withEmail"), getReviewer("noEmail", { email: undefined })],
            dataSets: [
                getDataSetSharing({ userAccesses: [{ id: "withEmail" }, { id: "noEmail" }] }),
            ],
        });

        await notifyForDataReview();

        expect(getSentRecipients()).toEqual(["withEmail@example.com"]);
    });

    it("sends no email when the data set is not found", async () => {
        const { userRequests } = setupApi({ reviewers: [getReviewer("reviewer1")], dataSets: [] });

        const emailSent = await notifyForDataReview();

        expect(emailSent).toBe(false);
        expect(userRequests).toEqual([]);
        expect(mock.history.post).toEqual([]);
    });

    it("sends no email when there are no reviewers", async () => {
        const { userRequests } = setupApi({ reviewers: [] });

        const emailSent = await notifyForDataReview();

        expect(emailSent).toBe(false);
        expect(userRequests).toEqual([]);
        expect(mock.history.post).toEqual([]);
    });

    it("returns false when the email request fails", async () => {
        setupApi({
            reviewers: [getReviewer("reviewer1")],
            dataSets: [getDataSetSharing({ userAccesses: [{ id: "reviewer1" }] })],
            emailStatus: 409,
        });

        const emailSent = await notifyForDataReview();

        expect(emailSent).toBe(false);
    });
});

describe("ProjectNotification.getRecipients", () => {
    const configuredEmails = appConfig.app.notifyEmailOnProjectSave;

    function setupUsersApi(
        users: Array<{ email: string; userCredentials?: { disabled: boolean } }>
    ) {
        mock.reset();
        mock.onGet(metadataPath).reply(200, { users });
    }

    it("returns the configured emails and the emails of the enabled users in the notification group", async () => {
        setupUsersApi([
            { email: "enabled@example.com", userCredentials: { disabled: false } },
            { email: "disabled@example.com", userCredentials: { disabled: true } },
        ]);

        const recipients = await ProjectNotification.getRecipients(api);

        expect(recipients).toEqual([...configuredEmails, "enabled@example.com"]);
    });

    it("excludes users whose disabled flag is not returned by the API", async () => {
        setupUsersApi([
            { email: "enabled@example.com", userCredentials: { disabled: false } },
            { email: "unknownStatus@example.com" },
        ]);

        const recipients = await ProjectNotification.getRecipients(api);

        expect(recipients).toEqual([...configuredEmails, "enabled@example.com"]);
    });
});
