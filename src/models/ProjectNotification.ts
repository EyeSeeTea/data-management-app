import _ from "lodash";

import Project, { DataSetType, ProjectAction } from "./Project";
import i18n from "../locales";
import User from "./user";
import { generateUrl } from "../router";
import { D2Api } from "../types/d2-api";
import ProjectDb, { ExistingData, getStringDataValue } from "./ProjectDb";
import { baseConfig } from "./Config";
import moment from "moment";
import { appConfig } from "../app-config";

type Email = string;
type Action = ProjectAction;

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
                    fields: { email: true, userCredentials: { disabled: true } },
                    filter: { "userGroups.code": { eq: groupCode } },
                },
            })
            .getData();

        const users = _(usersInGroup)
            .reject(user => user.userCredentials.disabled)
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
                    fields: {
                        id: true,
                        users: {
                            email: true,
                            id: true,
                            userCredentials: { disabled: true },
                            userGroups: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                    filter: { name: { in: baseConfig.userRoles.dataReviewer } },
                },
                dataSets: {
                    fields: {
                        id: true,
                        userGroupAccesses: {
                            id: true,
                            displayName: true,
                        },
                        userAccesses: { id: true },
                    },
                    filter: { id: { in: [id] } },
                },
            })
            .getData();

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
        const dataSet = res.dataSets[0];

        const users = _(res.userRoles)
            .flatMap(userRole => userRole.users)
            .reject(user => user.userCredentials.disabled)
            .value();

        const userAccessEmails = users
            .filter(user => {
                return dataSet.userAccesses.some(userAccess => {
                    return userAccess.id === user.id;
                });
            })
            .map(user => user.email);

        const userGroupEmails = users
            .filter(user => {
                return dataSet.userGroupAccesses
                    .filter(ug => ug.displayName.includes("Country Admin"))
                    .some(userGroupAccess => {
                        return user.userGroups.some(userGroup => {
                            return userGroupAccess.id === userGroup.id;
                        });
                    });
            })
            .map(user => user.email);

        const recipients = _.union(userAccessEmails, userGroupEmails);

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
            // If the message could not be sent, just log to the console and continue the process.
            console.error(err);
            return true;
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
