import { useSnackbar } from "@eyeseetea/d2-ui-components";
import React from "react";
import { useAppContext } from "../contexts/api-context";
import { UniqueBeneficiariesSettings } from "../domain/entities/UniqueBeneficiariesSettings";
import { Id } from "../models/ProjectDocument";

export function useGetUniqueBeneficiaries(props: { id: Id; refresh: number }) {
    const { id, refresh } = props;
    const { compositionRoot } = useAppContext();
    const snackbar = useSnackbar();
    const [settings, setSettings] = React.useState<UniqueBeneficiariesSettings>();

    React.useEffect(() => {
        compositionRoot.uniqueBeneficiaries.getSettings.execute(id).then(setSettings, err => {
            snackbar.error(err.message);
        });
    }, [compositionRoot.uniqueBeneficiaries.getSettings, snackbar, id, refresh]);

    return { settings, setSettings };
}
