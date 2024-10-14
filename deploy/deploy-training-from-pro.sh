#!/bin/bash
set -e -u -o pipefail

cd "$(dirname "$0")"
script_dir=$(pwd)
source "./lib.sh"
source "./tasks.sh"

load_training_projects() {
    local url=$1
    cd "$script_dir/project-monitoring-app" || return 1
    yarn ts-node src/scripts/projects.ts --url="$url" import training-projects.json
}

training_post_clone() {
    local url=$1
    set_email_password "$url"
    enable_users "$url" "traindatareviewer,traindataviewer,traindataentry"
    change_server_name "$url" "SP Platform - Training"
    add_users_to_maintainer_roles "$url"
    set_logos "$url" "$script_dir/icons/training"
}

get_app_version() {
    local url=$1
    curl -sS -u "$auth" "$url/api/apps" |
        jq '.[] | select(.key == "Data-Management-App").version' -r
}

get_project_monitoring_app_source() {
    local url=$1

    app_version=$(get_app_version "$url")
    cd "$script_dir" || return 1

    # Connection to github is flaky from SP servers, clone locally and rsync it (before the script is run)
    cd "project-monitoring-app" || return 1

    git checkout v"$app_version" -f
    yarn install
    yarn add ts-node@10.8.1
    yarn localize
}

save_last_training_projects() {
    local url=$1
    date=$(date --date="60 day ago" "+%Y-%m-%d")
    cd "$script_dir/project-monitoring-app" || return 1
    yarn ts-node src/scripts/projects.ts --url="$url" --from="$date" export training-projects.json
}

delete_projects() {
    local image_training=$1
    d2-docker run-sql -i "$image_training" "$script_dir/sql/create-guest-user.sql"
    d2-docker run-sql -i "$image_training" "$script_dir/sql/empty_data_tables_228.sql"
    d2-docker run-sql -i "$image_training" "$script_dir/sql/delete-projects.sql"
}

start_from_pro() {
    local url=$1 image_pro=$2
    # shellcheck disable=SC2001
    image_training=$(echo "$image_pro" | sed "s/ip-pro/ip-training/")

    {
        d2-docker pull "$image_pro"
        if test 1 = 2; then
            current_image=$(d2-docker list | grep RUN | awk '{print $1}' | grep -m1 ip-training) || true

            if test "$current_image"; then
                d2-docker commit "$current_image"
                docker tag "$current_image" "$current_image-$(timestamp)"
                d2-docker stop "$current_image"
            fi

            docker tag "$image_pro" "$image_training"
            sudo image="$image_training" /usr/local/bin/start-dhis2-training
            wait_for_dhis2_server "$url"
        fi
    } >&2

    echo "$image_training"
}

main() {
    local image_pro=$1
    url=$(get_url 81)

    if curl -s "$url"; then
        get_project_monitoring_app_source "$url"
        save_last_training_projects "$url"
    fi

    image_training=$(start_from_pro "$url" "$image_pro")
    delete_projects "$image_training"
    load_training_projects "$url"
    training_post_clone "$url"
}

main "$@"
