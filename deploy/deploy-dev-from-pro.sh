#!/bin/bash
# shellcheck disable=SC2001

set -e -u -o pipefail

cd "$(dirname "$0")"
script_dir=$(pwd)
source "./lib.sh"
source "./tasks.sh"

start_from_pro() {
    local url=$1 image_pro=$2
    image=$(echo "$image_pro" | sed "s/ip-pro/ip-dev/")

    export TMPDIR=/data/tmp

    local image_running
    image_running=$(d2-docker list | grep RUN | awk '{print $1}' | grep -m1 ip-dev) || true

    if test "$image_running"; then
        d2-docker commit "$image_running"
        docker tag "$image_running" "$image_running-$(timestamp)"
        d2-docker stop "$image_running"
    fi

    d2-docker pull "$image_pro"
    docker tag "$image_pro" "$image"
    sudo image="$image" /usr/local/bin/start-dhis2-dev

    wait_for_dhis2_server "$url"
}

post_clone() {
    local url=$1

    change_server_name "$url" "SP Platform - DEV"
    set_logos "$url" "$script_dir/icons/dev"
    set_email_password "$url"
}

main() {
    local image_pro=$1
    url=$(get_url 80)

    start_from_pro "$url" "$image_pro"
    post_clone "$url"
}

main "$@"
