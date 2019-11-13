import React from "react";
import i18n from "../../locales";
import PageHeader from "../../components/page-header/PageHeader";
import { useHistory } from "react-router";
import { History } from "history";

function goTo(history: History, url: string) {
    history.push(url);
}

function getConfig() {
    const help = i18n.t(
        `Please click on the grey arrow next to the chart/table title if you want to modify the layout.`
    );

    return { help };
}

const Dashboard: React.FC = () => {
    const history = useHistory();
    const goToLandingPage = () => goTo(history, "/");
    const config = getConfig();
    const iFrameSrc = "http://dev2.eyeseetea.com:8081/dhis-web-dashboard/#/nghVC4wtyzi";

    return (
        <React.Fragment>
            <PageHeader
                title={i18n.t("Dashboard")}
                help={config.help}
                onBackClick={goToLandingPage}
            />
            <iframe id="iframe" title={i18n.t("Dashboard")} src={iFrameSrc} style={styles.iframe} />
        </React.Fragment>
    );
};

const styles = {
    iframe: { width: "100%", height: 1000 },
};

export default Dashboard;
