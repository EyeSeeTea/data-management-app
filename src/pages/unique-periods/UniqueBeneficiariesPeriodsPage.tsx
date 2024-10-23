import React from "react";
import { ConfirmationDialog, useLoading, useSnackbar } from "@eyeseetea/d2-ui-components";
import { Dialog, DialogContent, DialogTitle } from "@material-ui/core";
import { useHistory, useParams } from "react-router-dom";
import PageHeader from "../../components/page-header/PageHeader";
import {
    ActionTable,
    UniqueBeneficiariesTable,
} from "../../components/unique-beneficiaries/UniqueBeneficiariesTable";
import { useAppContext } from "../../contexts/api-context";
import { Ref } from "../../domain/entities/Ref";
import {
    UniqueBeneficiariesPeriod,
    UniqueBeneficiariesPeriodsAttrs,
} from "../../domain/entities/UniqueBeneficiariesPeriod";
import { UniqueBeneficiariesSettings } from "../../domain/entities/UniqueBeneficiariesSettings";
import i18n from "../../locales";
import { UniquePeriodsForm } from "./UniquePeriodsForm";

export const UniqueBeneficiariesPeriodsPage = React.memo(() => {
    const { compositionRoot } = useAppContext();
    const { id } = useParams<Ref>();
    const history = useHistory();
    const snackbar = useSnackbar();
    const loading = useLoading();
    const [settings, setSettings] = React.useState<UniqueBeneficiariesSettings>();
    const [savePeriodModal, setSavePeriodModal] = React.useState(false);
    const [deleteModal, setDeleteModal] = React.useState(false);
    const [selectedPeriod, setSelectedPeriod] = React.useState<UniqueBeneficiariesPeriodsAttrs>();
    const [refresh, setRefresh] = React.useState(1);

    React.useEffect(() => {
        loading.show(true, i18n.t("Loading Periods..."));
        compositionRoot.uniqueBeneficiaries.getSettings
            .execute(id)
            .then(setSettings, err => {
                snackbar.error(err.message);
            })
            .finally(() => loading.hide());
    }, [compositionRoot.uniqueBeneficiaries.getSettings, loading, snackbar, id, refresh]);

    const openSavePeriodDialog = React.useCallback(
        (options: ActionTable) => {
            setSelectedPeriod(settings?.periods.find(period => period.id === options.id));
            if (options.action === "add" || options.action === "edit") {
                setSavePeriodModal(true);
            } else if (options.action === "delete") {
                setDeleteModal(true);
            }
        },
        [settings?.periods]
    );

    const savePeriod = React.useCallback(
        (periodData: UniqueBeneficiariesPeriod) => {
            loading.show(true, i18n.t("Saving Period..."));
            compositionRoot.uniqueBeneficiaries.saveSettings
                .execute({ period: periodData, projectId: id })
                .then(() => {
                    snackbar.success(i18n.t("Period saved successfully"));
                    setRefresh(refresh + 1);
                    setSavePeriodModal(false);
                    setSelectedPeriod(undefined);
                })
                .catch(err => {
                    snackbar.error(err.message);
                })
                .finally(() => {
                    loading.hide();
                });
        },
        [compositionRoot.uniqueBeneficiaries.saveSettings, id, loading, refresh, snackbar]
    );

    const removePeriod = React.useCallback(() => {
        if (!selectedPeriod) return;
        const period = UniqueBeneficiariesPeriod.build(selectedPeriod).get();
        loading.show(true, i18n.t("Removing Period..."));
        compositionRoot.uniqueBeneficiaries.removePeriod
            .execute({ projectId: id, period })
            .then(() => {
                setRefresh(refresh + 1);
                snackbar.success(i18n.t("Period removed successfully"));
            })
            .catch(err => {
                snackbar.error(err.message);
            })
            .finally(() => {
                setDeleteModal(false);
                setSelectedPeriod(undefined);
                loading.hide();
            });
    }, [
        compositionRoot.uniqueBeneficiaries.removePeriod,
        id,
        loading,
        refresh,
        selectedPeriod,
        snackbar,
    ]);

    return (
        <div>
            <PageHeader
                title={i18n.t("Unique Beneficiaries Periods")}
                onBackClick={() => history.push("/")}
            />

            <UniqueBeneficiariesTable
                periods={settings?.periods || []}
                onChangeAction={openSavePeriodDialog}
            />

            <Dialog open={savePeriodModal}>
                <DialogTitle>
                    {i18n.t("{{actionPeriod}} Period", {
                        actionPeriod: selectedPeriod ? i18n.t("Edit") : i18n.t("Create"),
                    })}
                </DialogTitle>
                <DialogContent>
                    <UniquePeriodsForm
                        existingPeriod={selectedPeriod}
                        onSubmit={savePeriod}
                        onClose={() => {
                            setSavePeriodModal(false);
                            setSelectedPeriod(undefined);
                        }}
                    />
                </DialogContent>
            </Dialog>

            <ConfirmationDialog
                open={deleteModal}
                onSave={removePeriod}
                title={i18n.t("Are you sure you want to delete the period: {{period}}?", {
                    nsSeparator: false,
                    period: selectedPeriod ? selectedPeriod.name : "",
                })}
                onCancel={() => {
                    setDeleteModal(false);
                    setSelectedPeriod(undefined);
                }}
                saveText={i18n.t("Delete")}
                cancelText={i18n.t("Cancel")}
            />
        </div>
    );
});

UniqueBeneficiariesPeriodsPage.displayName = "UniqueBeneficiariesPeriodsPage";
