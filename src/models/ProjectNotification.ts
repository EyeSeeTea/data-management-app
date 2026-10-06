import _ from "lodash";

import Project, { DataSetType, ProjectAction } from "./Project";
import i18n from "../locales";
import User from "./user";
import { generateUrl } from "../router";
import { D2Api, Id } from "../types/d2-api";
import ProjectDb, { ExistingData, getStringDataValue } from "./ProjectDb";
import { baseConfig } from "./Config";
import moment from "moment";
import { appConfig } from "../app-config";
import { promiseMap } from "../migrations/utils";
import { Maybe } from "../types/utils";

type Email = string;
type Action = ProjectAction;

// Keeps the id filter of the users requests within URL length limits.
const usersPerRequest = 100;

const countryAdminGroupName = "Country Admin";

type DataReviewer = Readonly<{
    id: Id;
    email: Maybe<Email>;
    isDisabled: boolean;
    userGroupIds: ReadonlyArray<Id>;
}>;

export class ProjectNotification {
    constructor(
        private api: D2Api,
        private project: Project,
        private currentUser: User,
        private isTest: boolean
    ) {}

    static async getRecipients(api: D2Api) {
        const groupCode = "DATA_MANAGEMENT_NOTIFICATION";
        const { users: usersInGroup } = await api.metadata
            .get({
                users: {
                    fields: { email: true, disabled: true },
                    filter: { "userGroups.code": { eq: groupCode } },
                },
            })
            .getData();

        const users = _(usersInGroup)
            .reject(user => user.disabled)
            .value();

        return _(appConfig.app.notifyEmailOnProjectSave)
            .concat(users.map(user => user.email))
            .compact()
            .uniq()
            .value();
    }

    async notifyOnProjectSave(action: Action) {
        const recipients = await ProjectNotification.getRecipients(this.api);
        await this.notifySave(recipients, action);
        await this.notifyDanglingDataValues(recipients);
    }

    async notifyForDataReview(
        period: string,
        id: string,
        dataSetType: DataSetType
    ): Promise<boolean> {
        const { project } = this;
        const res = await this.api.metadata
            .get({
                userRoles: {
                    // Only ids are requested: any other field would be silently dropped by the API.
                    fields: { id: true, users: { id: true } },
                    filter: { name: { in: baseConfig.userRoles.dataReviewer } },
                },
                dataSets: {
                    fields: {
                        id: true,
                        sharing: { public: true, external: true, users: true, userGroups: true },
                    },
                    filter: { id: { in: [id] } },
                },
            })
            .getData();

        const dataSet = res.dataSets[0];
        if (!dataSet) return false;

        const { displayName: user, username } = this.currentUser.data;

        const subject = i18n.t("[SP Platform] Request for Data Review: {{-name}} ({{code}})", {
            name: project.name,
            code: project.code,
            nsSeparator: false,
        });

        const year = period.slice(0, 4);
        const month = moment.months(Number(period.slice(4)) - 1);

        const projectId = this.project.id;
        const path = generateUrl("dataApproval", { id: projectId, dataSetType, period });
        const dataApprovalLink = getFullUrl(path);

        const reviewerIds = _(res.userRoles)
            .flatMap(userRole => userRole.users)
            .map(reviewer => reviewer.id)
            .uniq()
            .value();
        const reviewers = await this.getDataReviewers(reviewerIds);

        const sharedUserIds = new Set(Object.keys(dataSet.sharing.users));

        const dataSetsUserGroups = Object.values(dataSet.sharing.userGroups);

        const sharedCountryAdminGroupIds = new Set(
            dataSetsUserGroups
                .filter(userGroupAccess =>
                    userGroupAccess.displayName.includes(countryAdminGroupName)
                )
                .map(userGroupAccess => userGroupAccess.id)
        );

        const recipients = _(reviewers)
            .reject(reviewer => reviewer.isDisabled)
            .filter(
                reviewer =>
                    sharedUserIds.has(reviewer.id) ||
                    reviewer.userGroupIds.some(userGroupId =>
                        sharedCountryAdminGroupIds.has(userGroupId)
                    )
            )
            .map(reviewer => reviewer.email)
            .compact()
            .uniq()
            .value();

        const text = i18n.t(
            `
User {{user}} ({{username}}) is requesting data approval.

Project: [{{projectCode}}] {{projectName}}.

Dataset: {{dataSetType}} values for {{month}} {{year}}

Go to approval screen: {{- projectUrl}}`,
            {
                user,
                username,
                projectName: this.project.name,
                projectCode: this.project.code,
                dataSetType,
                projectUrl: dataApprovalLink,
                month,
                year,
                nsSeparator: false,
            }
        );

        return this.sendMessage({ recipients, subject, text: text.trim() });
    }

    /* DHIS2 serializes users nested in other metadata objects (userRoles.users) with basic fields
       only (id, code, name, displayName, username), whichever fields are requested, so the details
       needed to notify them must be requested on the top-level users collection. */
    private async getDataReviewers(userIds: Id[]): Promise<DataReviewer[]> {
        const usersByChunk = await promiseMap(_.chunk(userIds, usersPerRequest), ids =>
            this.getUsersDetails(ids)
        );

        return _.flatten(usersByChunk);
    }

    private async getUsersDetails(userIds: Id[]): Promise<DataReviewer[]> {
        const { users } = await this.api.metadata
            .get({
                users: {
                    fields: {
                        id: true,
                        email: true,
                        disabled: true,
                        userGroups: { id: true },
                    },
                    filter: { id: { in: userIds } },
                },
            })
            .getData();

        return users.map(user => ({
            id: user.id,
            email: user.email,
            isDisabled: user.disabled,
            userGroupIds: user.userGroups.map(userGroup => userGroup.id),
        }));
    }

    async sendMessageForIndicatorsRemoval(options: {
        currentUser: User;
        message: string;
        existingData: ExistingData;
    }) {
        const { currentUser, message, existingData } = options;
        const { displayName: user, username } = currentUser.data;
        const recipients = await ProjectNotification.getRecipients(this.api);
        const subject = i18n.t("{{username}} has removed indicators with data", { username });

        const dataElementsList = existingData.dataElementsWithData
            .map(de => `- [${de.sector.name}] [${de.code}] ${de.name}`)
            .join("\n");

        const text = i18n.t(
            `
User {{user}} ({{username}}) has edited a project and removed some indicators with existing data.

Project: [{{projectCode}}] {{projectName}}

Removed indicators:

{{dataElementsList}}

The reason provided by the user was:

{{message}}`,
            {
                user,
                username,
                projectName: this.project.name,
                projectCode: this.project.code,
                dataElementsList,
                message,
                nsSeparator: false,
            }
        );

        return this.sendMessage({ recipients, subject, text: text.trim() });
    }

    static buildBaseMessage(action: Action): string {
        switch (action) {
            case "create":
                return i18n.t("Project created");
            case "edit":
                return i18n.t("Project updated");
            case "clone":
                return i18n.t("Project created");
            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }

    private async notifySave(recipients: Email[], action: Action) {
        const { project, currentUser } = this;
        const baseMsg = ProjectNotification.buildBaseMessage(action);
        const subject = `${baseMsg}: ${this.project.name}`;

        const body = [
            i18n.t("Project '{{projectName}}' was {{action}} by {{user}} ({{username}})", {
                projectName: project.name,
                action: action === "create" ? i18n.t("created") : i18n.t("updated"),
                user: currentUser.data.displayName,
                username: currentUser.data.username,
            }),

            // Cypress fails when body includes an URL,
            !this.isTest ? getProjectUrl(project) : "test-url",
            replaceInitialSpacesByNbsp(project.info.getAsString()),
        ];

        const text = body.join("\n\n");
        return this.sendMessage({ recipients, subject, text });
    }

    private async notifyDanglingDataValues(recipients: Email[]) {
        const { project } = this;
        const dataValues = await new ProjectDb(project).getDanglingDataValues();
        if (_.isEmpty(dataValues)) return;

        const projectName = project.name;
        const subject = i18n.t("Project '{{projectName}}' [dangling data values]", { projectName });
        const limit = 10;
        const dataValuesToShow = _.take(dataValues, limit);
        const showWasLimited = dataValuesToShow.length < dataValues.length;
        const countMore = dataValues.length - dataValuesToShow.length;

        const parts = [
            i18n.t("Project '{{projectName}}' has {{count}} dangling data values:", {
                count: dataValues.length,
                projectName: projectName,
            }),
            "",
            ...dataValuesToShow.map(getStringDataValue),
            showWasLimited ? i18n.t("... and {{countMore}} more", { countMore: countMore }) : null,
        ];

        const text = parts.filter(s => s !== null).join("\n");

        return this.sendMessage({ recipients, subject, text });
    }

    private async sendMessage(options: {
        recipients: string[];
        subject: string;
        text: string;
    }): Promise<boolean> {
        const { api } = this;
        console.debug(`sendMessage: recipients=${options.recipients.join(", ")}`);
        const devRecipients = localStorage.getItem("recipients");
        const recipients =
            devRecipients !== null ? _.compact(devRecipients.split(",")) : options.recipients;

        if (_.isEmpty(recipients)) return false;

        try {
            await api.email.sendMessage({ ...options, recipients }).getData();
            return true;
        } catch (err) {
            // If the message could not be sent, log to the console and let the caller report it.
            console.error(err);
            return false;
        }
    }
}

function getProjectUrl(project: Project) {
    const path = generateUrl("projects", undefined, { search: project.code });
    return getFullUrl(path);
}

function getFullUrl(path: string): string {
    return window.location.href.split("#")[0] + "#" + path;
}

function replaceInitialSpacesByNbsp(s: string): string {
    return s
        .split(/\n/)
        .map(line => _.repeat("&nbsp;", line.match(/^\s+/)?.[0].length || 0) + line.trimLeft())
        .join("\n");
}
