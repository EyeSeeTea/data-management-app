import React from "react";
import { Route, Switch, HashRouter } from "react-router-dom";

import MerReport from "../report/MerReport";
import { generateUrl } from "../../router";
import ProjectWizard from "../project-wizard/ProjectWizard";
import DataValues from "../data-values/DataValues";
import DataApproval from "../data-approval/DataApproval";
import CountriesList from "../../components/countries-list/CountriesList";
import ProjectsList from "../projects-list/ProjectsList";
import ProjectDashboard from "../dashboard/ProjectDashboard";
import CountryDashboard from "../dashboard/CountryDashboard";
import AwardNumberDashboard from "../dashboard/AwardNumberDashboard";
import { LastLocationProvider } from "react-router-last-location";
import { UniqueBeneficiariesPeriodsPage } from "../unique-periods/UniqueBeneficiariesPeriodsPage";
import { ProjectIndicatorsValidation } from "../project-indicators-validation/ProjectIndicatorsValidation";
import { CountryIndicatorReport } from "../country-indicator-report/CountryIndicatorReport";

const Root = () => {
    const idParam = { id: ":id" };

    return (
        <HashRouter>
            <LastLocationProvider>
                <Switch>
                    <Route
                        path={generateUrl("projects.new")}
                        render={() => <ProjectWizard action={{ type: "create" }} />}
                    />
                    <Route
                        path={generateUrl("projects.edit", idParam)}
                        render={props => (
                            <ProjectWizard
                                action={{ type: "edit", id: props.match.params.id || "" }}
                            />
                        )}
                    />
                    <Route
                        path={generateUrl("projects.clone", idParam)}
                        render={props => (
                            <ProjectWizard
                                action={{ type: "clone", id: props.match.params.id || "" }}
                            />
                        )}
                    />
                    <Route path={generateUrl("report")} render={() => <MerReport />} />
                    <Route
                        path={generateUrl("actualValues", idParam)}
                        render={() => <DataValues type="actual" />}
                    />
                    <Route
                        path={generateUrl("targetValues", idParam)}
                        render={() => <DataValues type="target" />}
                    />
                    <Route
                        path={generateUrl("projectDashboard", idParam)}
                        render={() => <ProjectDashboard />}
                    />
                    <Route
                        path={generateUrl("awardNumberDashboard", idParam)}
                        render={() => <AwardNumberDashboard />}
                    />
                    <Route
                        path={generateUrl("countryDashboard", idParam)}
                        render={() => <CountryDashboard />}
                    />
                    <Route
                        path={generateUrl("dataApproval", {
                            id: ":id",
                            period: ":period",
                            dataSetType: ":dataSetType",
                        })}
                        render={() => <DataApproval />}
                    />
                    <Route
                        path={generateUrl("dataApproval", { id: ":id" })}
                        render={() => <DataApproval />}
                    />
                    <Route
                        path={generateUrl("uniqueBeneficiariesPeriods", { id: ":id" })}
                        render={() => <UniqueBeneficiariesPeriodsPage />}
                    />

                    <Route
                        path={generateUrl("projectIndicatorsValidation", { id: ":id" })}
                        render={() => <ProjectIndicatorsValidation />}
                    />

                    <Route path={generateUrl("countries")} render={() => <CountriesList />} />

                    <Route
                        path={generateUrl("countryIndicatorsReport")}
                        render={() => <CountryIndicatorReport />}
                    />

                    <Route render={() => <ProjectsList />} />
                </Switch>
            </LastLocationProvider>
        </HashRouter>
    );
};

export default React.memo(Root);
