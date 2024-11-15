#!/bin/bash
set -e -u -o pipefail

cd "$(dirname "$0")"
script_dir=$(pwd)
source "./lib.sh"
source "./tasks.sh"

start_from_pro() {
    local url=$1 image_pro=$2
    # shellcheck disable=SC2001
    image_test=$(echo "$image_pro" | sed "s/ip-pro/ip-test/")

    local running_image
    running_image=$(d2-docker list | grep RUN | awk '{print $1}' | grep -m1 ip-test) || true

    if test "$running_image"; then
        d2-docker commit "$running_image"
        docker tag "$running_image" "$running_image-$(timestamp)"
        d2-docker stop "$running_image"
    fi

    d2-docker pull "$image_pro"
    docker tag "$image_pro" "$image_test"
    sudo image=$image_test /usr/local/bin/start-dhis2-test

    wait_for_dhis2_server "$url"
}

post_clone() {
    local url=$1

    change_server_name "$url" "SP Platform - Test"
    set_logos "$url" "$script_dir/test-icons"
    set_email_password "$url"
    run_analytics "$url"
}

main() {
    local url
    url=$(get_url 80)

    start_from_pro "$url"
    post_clone "$url"
}

main "$@"
