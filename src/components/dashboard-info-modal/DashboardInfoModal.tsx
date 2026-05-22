import React from "react";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";

import i18n from "../../locales";

type DashboardInfoModalProps = {
    isOpen: boolean;
    onClose: () => void;
};

export const DashboardInfoModal: React.FC<DashboardInfoModalProps> = props => {
    const { isOpen, onClose } = props;

    return (
        <Dialog open={isOpen} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>{i18n.t("Purpose of Platform Dashboards")}</DialogTitle>
            <DialogContent dividers>
                <p>{i18n.t("These dashboards are meant to:")}</p>
                <ul>
                    <li>{i18n.t("Encourage data informed decisions.")}</li>
                    <li>
                        {i18n.t(
                            "Help implementers identify phenomena in data that can initiate opportunities for conversations and decision-making on how to engage in adaptive program management."
                        )}
                    </li>
                    <li>
                        {i18n.t(
                            "Be incorporated into the monthly quality process. Ideally, this check should be happening when preparing MERs for your regional teams."
                        )}
                    </li>
                </ul>
                <p>{i18n.t("Create a task list with some common follow on actions:")}</p>
                <ul>
                    <li>{i18n.t("Conversions by topic")}</li>
                    <li>{i18n.t("Errors identified")}</li>
                    <li>{i18n.t("Divergence from targets")}</li>
                    <li>
                        {i18n.t("Bullets on what to highlight in the MER with mitigation measures")}
                    </li>
                    <li>{i18n.t("Potential points to escalate")}</li>
                    <li>{i18n.t("Determining if site visits should be made")}</li>
                    <li>{i18n.t("Reviewing budget for spent, pending, and remaining")}</li>
                </ul>
                <p>
                    {i18n.t(
                        "If there is anything that can be improved, please let us know by sending an email to pmt@samaritan.org."
                    )}
                </p>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="primary">
                    {i18n.t("Close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
