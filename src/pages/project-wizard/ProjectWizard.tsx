import React from "react";
import { useLocation } from "react-router";
import _ from "lodash";
import { Wizard, useSnackbar, ConfirmationDialog } from "@eyeseetea/d2-ui-components";
import { LinearProgress } from "@material-ui/core";
import { Location } from "history";

import Project, { ProjectAction, ValidationKey } from "../../models/Project";
import { D2Api } from "../../types/d2-api";
import { generateUrl } from "../../router";
import i18n from "../../locales";
import ExitWizardButton from "../../components/wizard/ExitWizardButton";
import PageHeader from "../../components/page-header/PageHeader";
import { useAppContext } from "../../contexts/api-context";
import GeneralInfoStep from "../../components/steps/general-info/GeneralInfoStep";
import SectorsStep from "../../components/steps/sectors/SectorsStep";
import OrgUnitsStep from "../../components/steps/org-units/OrgUnitsStep";
import SaveStep from "../../components/steps/save/SaveStep";
import { getDevProject } from "../../models/dev-project";
import { Config } from "../../models/Config";
import { helpTexts } from "./help-texts";
import { ReactComponentLike } from "prop-types";
import SharingStep from "../../components/steps/sharing/SharingStep";
import DisaggregationStep from "../../components/steps/disaggregation/DisaggregationStep";
import DataElementsSelectionStep from "../../components/steps/data-elements-selection/DataElementsSelectionStep";
import MerSelectionStep from "../../components/steps/mer-selection/MerSelectionStep";
import { useAppHistory } from "../../utils/use-app-history";
import { Maybe } from "../../types/utils";
import { AttachFilesStep } from "../../components/steps/attach-files/AttachFilesStep";
import UniqueIndicatorsStep from "../../components/steps/unique-beneficiaries/UniqueIndicatorsStep";

type Action = { type: "create" } | { type: "edit"; id: string } | { type: "clone"; id: string };

interface ProjectWizardProps {
    action: Action;
}

export interface StepProps {
    api: D2Api;
    project: Project;
    onChange: (project: Project) => void;
    onCancel: () => void;
    action: ProjectAction;
}

interface Props {
    api: D2Api;
    config: Config;
    goBack(): void;
    location: Location;
    snackbar: any;
    action: Action;
    isDev: boolean;
}

interface State {
    project: Project | undefined;
    dialogOpen: boolean;
    isUpdated: boolean;
    showCloneWarning: boolean;
}

interface Step {
    key: string;
    label: string;
    component: ReactComponentLike;
    validationKeys?: ValidationKey[];
    validationKeysLive?: ValidationKey[];
    description?: string;
    help?: React.ReactNode;
}

class ProjectWizardImpl extends React.Component<Props, State> {
    state: State = {
        project: undefined,
        dialogOpen: false,
        isUpdated: false,
        showCloneWarning: true,
    };

    async componentDidMount() {
        try {
            const project = await this.getInitialProjectData();
            this.setState({ project: project });
        } catch (err: any) {
            console.error(err);
            this.props.snackbar.error(i18n.t("Cannot load project") + `: ${err.message || err}`);
            this.props.goBack();
        }
    }

    getInitialProjectData = async () => {
        switch (this.props.action.type) {
            case "create": {
                const project = Project.create(this.props.api, this.props.config);
                return getDevProject(project, this.props.isDev);
            }
            case "edit":
                return Project.get(this.props.api, this.props.config, this.props.action.id);
            case "clone":
                return Project.clone(this.props.api, this.props.config, this.props.action.id);
        }
    };

    isEdit() {
        return this.props.action.type === "edit";
    }

    isClone() {
        return this.props.action.type === "clone";
    }

    getStepsBaseInfo(): Step[] {
        const { project } = this.state;
        if (!project) return [];

        const isDisaggregationVisible = project.isPersisted() && project.hasCovid19Disaggregation();

        const steps: Array<Maybe<Step>> = [
            {
                key: "general-info",
                label: i18n.t("General info"),
                component: GeneralInfoStep,
                validationKeys: [
                    "name",
                    "startDate",
                    "endDate",
                    "endDateAfterStartDate",
                    "awardNumber",
                    "subsequentLettering",
                    "code",
                    "funders",
                ],
                description: i18n.t(`Please fill out information below for your project:`),
                help: helpTexts.generalInfo,
            },
            {
                key: "organisation-units",
                label: i18n.t("Country & Project Locations"),
                component: OrgUnitsStep,
                validationKeys: ["parentOrgUnit", "locations"],
                description: i18n.t(
                    `Please select your country office and project location/s below:`
                ),
                help: helpTexts.organisationUnits,
            },
            {
                key: "sectors",
                label: i18n.t("Sectors"),
                component: SectorsStep,
                validationKeys: ["sectors"],
                help: helpTexts.sectors,
            },
            {
                key: "indicators",
                label: i18n.t("Indicators"),
                component: DataElementsSelectionStep,
                validationKeys: ["dataElementsSelection"],
                help: helpTexts.indicators,
            },
            isDisaggregationVisible
                ? {
                      key: "disaggregation",
                      label: i18n.t("Disaggregation"),
                      component: DisaggregationStep,
                      validationKeys: [],
                      help: helpTexts.disaggregation,
                  }
                : null,
            {
                key: "mer-indicators",
                label: i18n.t("MER Indicators"),
                component: MerSelectionStep,
                validationKeys: ["dataElementsMER"],
                help: helpTexts.merIndicators,
            },
            {
                key: "unique-beneficiaries",
                label: i18n.t("Unique Indicators"),
                component: UniqueIndicatorsStep,
                validationKeys: ["uniqueIndicators"],
                help: helpTexts.uniqueIndicators,
            },
            {
                key: "sharing",
                label: i18n.t("Username Access"),
                component: SharingStep,
                description: i18n.t("Define Sharing settings for project data."),
            },
            {
                key: "attach",
                label: i18n.t("Files"),
                component: AttachFilesStep,
                description: i18n.t("Attach files for the project"),
            },
            {
                key: "save",
                label: i18n.t("Summary and Save"),
                component: SaveStep,
                description: i18n.t(
                    "The setup of your project is complete. Please review the information below and click the “Save” button once complete."
                ),
                help: helpTexts.save,
            },
        ];

        return _.compact(steps);
    }

    cancelSave = () => {
        const { isUpdated } = this.state;

        if (isUpdated) {
            this.setState({ dialogOpen: true });
        } else {
            this.props.goBack();
        }
    };

    goBack = () => {
        this.props.goBack();
    };

    handleDialogCancel = () => {
        this.setState({ dialogOpen: false });
    };

    closeSnackbar = () => {
        this.props.snackbar.closeSnackbar();
    };

    onChange = (step: Step) => async (project: Project) => {
        const errors = await getValidationMessages(project, step.validationKeysLive || []);
        this.setState({ project, isUpdated: true });

        if (!_(errors).isEmpty()) {
            this.props.snackbar.error(errors.join("\n"));
        }
    };

    onStepChangeRequest = async (currentStep: Step) => {
        return await getValidationMessages(this.state.project, currentStep.validationKeys);
    };

    getTitle = (): string => {
        switch (this.props.action.type) {
            case "edit":
                return i18n.t("Edit project");
            case "clone":
                return i18n.t("Clone project");
            case "create":
                return i18n.t("New project");
        }
    };

    render() {
        const { project, dialogOpen, showCloneWarning } = this.state;
        const { api, location, action } = this.props;
        if (project) Object.assign(window, { project, Project });

        const steps = this.getStepsBaseInfo().map(step => ({
            ...step,
            props: {
                project,
                api,
                onChange: this.onChange(step),
                onCancel: this.goBack,
                action: action.type,
            },
        }));

        const urlHash = location.hash.split("#")[1];
        const stepExists = steps.find(step => step.key === urlHash);
        const firstStepKey = steps.map(step => step.key)[0];
        const initialStepKey = stepExists ? urlHash : firstStepKey;
        const lastClickableStepIndex = this.isEdit() || this.isClone() ? steps.length - 1 : 0;
        const title = this.getTitle();

        return (
            <React.Fragment>
                <ExitWizardButton
                    isOpen={dialogOpen}
                    onConfirm={this.goBack}
                    onCancel={this.handleDialogCancel}
                />
                <PageHeader
                    title={`${title}: ${project ? project.name : i18n.t("Loading...")}`}
                    onBackClick={this.cancelSave}
                />

                <ConfirmationDialog
                    open={action.type === "clone" && Boolean(project) && showCloneWarning}
                    title={`${title}: ${project ? project.name : ""}`}
                    description={i18n.t(
                        "Please review all prefilled information including Project numbers and dates which MUST be updated."
                    )}
                    saveText={i18n.t("OK")}
                    onSave={() => this.setState({ showCloneWarning: false })}
                />

                {project ? (
                    <Wizard
                        steps={steps}
                        initialStepKey={initialStepKey}
                        useSnackFeedback={true}
                        onStepChange={this.closeSnackbar}
                        onStepChangeRequest={this.onStepChangeRequest}
                        lastClickableStepIndex={lastClickableStepIndex}
                    />
                ) : (
                    <LinearProgress />
                )}
            </React.Fragment>
        );
    }
}

async function getValidationMessages(
    project: Project | undefined,
    validationKeys: ValidationKey[] | undefined
): Promise<string[]> {
    if (!project || !validationKeys || validationKeys.length === 0) return [];

    const validationObj = await project.validate(validationKeys);

    return _(validationObj).at(validationKeys).flatten().compact().value();
}

const ProjectWizardImplMemo = React.memo(ProjectWizardImpl);

const ProjectWizard: React.FC<ProjectWizardProps> = props => {
    const snackbar = useSnackbar();
    const location = useLocation();
    const { api, config, isDev } = useAppContext();
    const { action } = props;
    const appHistory = useAppHistory(generateUrl("projects"));

    return (
        <ProjectWizardImplMemo
            snackbar={snackbar}
            api={api}
            config={config}
            goBack={appHistory.goBack}
            location={location}
            action={action}
            isDev={isDev}
        />
    );
};

export default React.memo(ProjectWizard);
