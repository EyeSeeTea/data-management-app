import React from "react";
import {
    Button,
    Dialog,
    DialogTitle,
    DialogActions,
    DialogContent,
    DialogContentText,
} from "@material-ui/core";

import { ProjectForMer, MerProjectStatus } from "../../models/MerReport";
import i18n from "../../locales";
import { Maybe } from "../../types/utils";
import { Link } from "react-router-dom";

type DataApprovalDialogProps = {
    project: ProjectForMer;
    open: boolean;
    approvalStatus: Maybe<MerProjectStatus>;
    onClose: () => void;
};

export const DataApprovalDialog = (props: DataApprovalDialogProps) => {
    const { approvalStatus, project, onClose, open } = props;

    const isActualUnapproved = approvalStatus?.actual?.isUnapproved;
    const isTargetUnapproved = approvalStatus?.target?.isUnapproved;

    const statusSummaryText = getStatusSummaryText(approvalStatus);

    return (
        <Dialog open={open}>
            <DialogTitle>
                {project.code} - {project.name}
            </DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {i18n.t(
                        "The {{status}} data for the selected month in this project is currently unapproved. Click here to review and approve it on the Data Approval page (opens in a new tab).",
                        { status: statusSummaryText }
                    )}
                </DialogContentText>
                {isActualUnapproved && approvalStatus.actual && (
                    <DataApprovalLinkText
                        approvalType="actual"
                        period={approvalStatus.actual.period}
                        projectId={project.id}
                    />
                )}

                {isTargetUnapproved && approvalStatus.target && (
                    <DataApprovalLinkText
                        approvalType="target"
                        period={approvalStatus.target.period}
                        projectId={project.id}
                    />
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="secondary">
                    {i18n.t("Close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

type DataApprovalLinkTextProps = {
    projectId: string;
    period: string;
    approvalType: "actual" | "target";
};

export const DataApprovalLinkText = (props: DataApprovalLinkTextProps) => {
    const { projectId, period, approvalType } = props;

    const approvalTypeText = approvalType === "actual" ? i18n.t("Actual") : i18n.t("Target");

    return (
        <DialogContentText>
            {i18n.t("Click")}{" "}
            <Link
                to={`/data-approval/${projectId}/${approvalType}/${period}`}
                target="_blank"
                rel="noopener noreferrer"
            >
                {i18n.t("here")}
            </Link>{" "}
            {i18n.t("to review and approve the {{approvalTypeText}} data for this project.", {
                approvalTypeText: approvalTypeText,
            })}
        </DialogContentText>
    );
};

function getStatusSummaryText(approvalStatus: Maybe<MerProjectStatus>): string {
    if (!approvalStatus) return i18n.t("");

    if (approvalStatus.actual?.isUnapproved && approvalStatus.target?.isUnapproved) {
        return i18n.t("Target and Actual");
    } else if (approvalStatus.actual?.isUnapproved) {
        return i18n.t("Actual");
    } else if (approvalStatus.target?.isUnapproved) {
        return i18n.t("Target");
    } else {
        return "";
    }
}
