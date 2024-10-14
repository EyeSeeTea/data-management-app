#!/bin/bash
set -e -u -o pipefail

# Requirements: vendorlink SSH channel open with spintldhis01, stintldhis01, sdintldhis01.

cd "$(dirname "$0")"
source "./lib.sh"

clone() {
    setup_training
    image_pro=$(run spintldhis01 bash -x push-pro-docker.sh --skip_dump)
    run stintldhis01 bash deploy-test-from-pro.sh "$image_pro"
    run stintldhis01 bash -x deploy-training-from-pro.sh "$image_pro"
    run sdintldhis01 bash -x deploy-dev-from-pro.sh "$image_pro"
}

setup_training() {
    local repo_url="https://github.com/eyeseetea/project-monitoring-app"

    if test -e "project-monitoring-app"; then
        cd "project-monitoring-app"
        git fetch
        cd ..
    else
        git clone "$repo_url"
    fi

}

clone
