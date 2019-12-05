import React from "react";
import { OldObjectsTable, TableColumn } from "d2-ui-components";
import i18n from "../../locales";
import _ from "lodash";
import PageHeader from "../../components/page-header/PageHeader";
import { useHistory } from "react-router";
import { History } from "history";
import { useAppContext, CurrentUser } from "../../contexts/api-context";
import { generateUrl } from "../../router";
import Project, { FiltersForList, ProjectForList } from "../../models/Project";
import { Pagination } from "../../types/ObjectsList";
import "./ProjectsList.css";
import { Config } from "../../models/Config";
import { formatDateShort, formatDateLong } from "../../utils/date";
import { GetPropertiesByType } from "../../types/utils";

type UserRolesConfig = Config["base"]["userRoles"];

type ActionsRoleMapping<Actions> = {
    [Key in keyof UserRolesConfig]?: Array<keyof Actions>;
};

function goTo(history: History, url: string) {
    history.push(url);
}

const Link: React.FC<{ url: string }> = ({ url }) => {
    return (
        <a
            rel="noopener noreferrer"
            style={{ wordBreak: "break-all", textDecoration: "none" }}
            href={url}
            target="_blank"
        >
            {url}
        </a>
    );
};

function columnDate(
    field: GetPropertiesByType<ProjectForList, string>,
    format: "date" | "datetime"
) {
    const formatter = format === "date" ? formatDateShort : formatDateLong;
    return {
        name: field,
        getValue: (project: ProjectForList) => formatter(project[field]),
    };
}

function getConfig(history: History, currentUser: CurrentUser) {
    const columns: TableColumn<ProjectForList>[] = [
        { name: "displayName", text: i18n.t("Name"), sortable: true },
        { ...columnDate("lastUpdated", "datetime"), text: i18n.t("Last updated"), sortable: true },
        {
            ...columnDate("created", "datetime"),
            text: i18n.t("Created"),
            sortable: true,
        },
        { ...columnDate("openingDate", "date"), text: i18n.t("Opening date"), sortable: true },
        { ...columnDate("closedDate", "date"), text: i18n.t("Closed date"), sortable: true },
    ];

    const initialSorting = ["displayName", "asc"];
    const detailsFields = [
        { name: "displayName", text: i18n.t("Name") },
        {
            name: "code",
            text: i18n.t("Code"),
            getValue: (project: ProjectForList) => `${project.code}`,
        },
        { name: "displayDescription", text: i18n.t("Description") },
        { ...columnDate("lastUpdated", "datetime"), text: i18n.t("Last Updated") },
        {
            name: "lastUpdatedBy",
            text: i18n.t("Last Updated By"),
            getValue: (project: ProjectForList) => ` ${project.lastUpdatedBy.name}`,
        },
        { ...columnDate("created", "datetime"), text: i18n.t("Created") },
        {
            name: "createdBy",
            text: i18n.t("Created By"),
            getValue: (project: ProjectForList) => `${project.user.displayName}`,
        },
        { ...columnDate("openingDate", "date"), text: i18n.t("Opening Date") },
        { ...columnDate("closedDate", "date"), text: i18n.t("Closed Date") },
        {
            name: "href",
            text: i18n.t("API Link"),
            getValue: function getDataSetLink(project: ProjectForList) {
                return <Link url={project.href + ".json"} />;
            },
        },
    ];

    const allActions = {
        details: {
            name: "details",
            text: i18n.t("Details"),
            multiple: false,
            type: "details",
            isPrimary: true,
        },

        actualValues: {
            name: "add-actual-values",
            icon: "library_books",
            text: i18n.t("Add Actual Values"),
            multiple: false,
            onClick: (project: ProjectForList) =>
                goTo(history, generateUrl("actualValues", { id: project.id })),
        },

        dashboard: {
            name: "dashboard",
            icon: "dashboard",
            text: i18n.t("Go to Dashboard"),
            multiple: false,
            onClick: (project: ProjectForList) =>
                goTo(history, generateUrl("dashboard", { id: project.id })),
        },

        targetValues: {
            name: "add-target-values",
            icon: "assignment",
            text: i18n.t("Add Target Values"),
            multiple: false,
            onClick: (project: ProjectForList) =>
                goTo(history, generateUrl("targetValues", { id: project.id })),
        },

        downloadData: {
            name: "download-data",
            icon: "cloud_download",
            text: i18n.t("Download Data"),
            multiple: false,
        },

        configMER: {
            name: "mer",
            icon: "description",
            text: i18n.t("Generate / Configure MER"),
            multiple: false,
        },

        edit: {
            name: "edit",
            text: i18n.t("Edit"),
            multiple: false,
            onClick: (project: ProjectForList) =>
                goTo(history, generateUrl("projects.edit", { id: project.id })),
        },

        delete: {
            name: "delete",
            text: i18n.t("Delete"),
            multiple: true,
            onClick: (projects: ProjectForList[]) => {
                console.log("delete", projects);
            },
        },
    };

    const actionsForUserRoles: ActionsRoleMapping<typeof allActions> = {
        dataReviewer: [
            "dashboard",
            "edit",
            "actualValues",
            "targetValues",
            "downloadData",
            "configMER",
        ],
        dataViewer: ["dashboard", "downloadData"],
        admin: [
            "dashboard",
            "edit",
            "delete",
            "actualValues",
            "targetValues",
            "downloadData",
            "configMER",
        ],
        dataEntry: ["actualValues", "targetValues", "dashboard", "downloadData"],
    };

    const roleKeys = (_.keys(actionsForUserRoles) as unknown) as Array<keyof UserRolesConfig>;
    const actionsByRole = _(roleKeys)
        .flatMap(roleKey => {
            const actionKeys: Array<keyof typeof allActions> = actionsForUserRoles[roleKey] || [];
            return currentUser.hasRole(roleKey) ? actionKeys.map(key => allActions[key]) : [];
        })
        .uniq()
        .value();

    const actions = [allActions.details, ...actionsByRole];

    const help = i18n.t(
        `Click the blue button to create a new project or select a previously created project that you may want to access.

             Click the three dots on the right side of the screen if you wish to perform an action over a project.`
    );

    return { columns, initialSorting, detailsFields, actions, help };
}

const ProjectsList: React.FC = () => {
    const history = useHistory();
    const { api, config, currentUser } = useAppContext();
    const goToLandingPage = () => goTo(history, "/");

    const componentConfig = getConfig(history, currentUser);

    const list = (_d2: unknown, filters: FiltersForList, pagination: Pagination) =>
        Project.getList(api, config, filters, pagination);

    const newProjectPageHandler = currentUser.canCreateProject()
        ? () => goTo(history, generateUrl("projects.new"))
        : null;

    return (
        <React.Fragment>
            <PageHeader
                title={i18n.t("Projects")}
                help={componentConfig.help}
                onBackClick={goToLandingPage}
            />

            <OldObjectsTable
                model={{ modelValidations: {} }}
                columns={componentConfig.columns}
                d2={{}}
                detailsFields={componentConfig.detailsFields}
                initialSorting={componentConfig.initialSorting}
                pageSize={20}
                actions={componentConfig.actions}
                list={list}
                disableMultiplePageSelection={true}
                buttonLabel={i18n.t("Create Project")}
                onButtonClick={newProjectPageHandler}
            />
        </React.Fragment>
    );
};

export default ProjectsList;
