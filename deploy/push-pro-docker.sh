#!/bin/bash
set -e -u -o pipefail

cd "$(dirname "$0")"
source "./lib.sh"
source "./auth.sh"
source "./opts.sh"

dump_and_push() {
    options --skip_dump -- "$@"

    version=$(curl -sS -u "$auth" http://localhost/api/system/info.json | jq -r .version | sed "s/2\.4/4/")
    name="docker.eyeseetea.com/samaritans/dhis2-data:$version-sp-ip-pro"
    debug "Docker image: $name"

    if test -z "${skip_dump:-}"; then
        sql_filename="/tmp/db.sql.gz"
        cd /tmp
        debug "Dump DB: $name -> $sql_filename"
        sudo -u postgres pg_dump dhis2 | gzip >"$sql_filename"

        debug "Create d2-docker image: $name"
        sudo d2-docker create data --sql="$sql_filename" "$name" \
            --apps-dir=/home/dhis/ip-40/config/files/apps/ \
            --documents-dir=/home/dhis/ip-40/config/files/document/
        sudo docker push "$name"
    fi

    echo "$name"
}

dump_and_push "$@"
