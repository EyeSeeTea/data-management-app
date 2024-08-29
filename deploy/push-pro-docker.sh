#!/bin/bash
set -e -u -o pipefail

script_dir=$(dirname "$0")
source "./lib.sh"

sql_filename="/tmp/db.sql.gz"

cd /tmp
echo "Dump DB: $image_pro -> $sql_filename"
sudo -u postgres pg_dump dhis2 | gzip >"$sql_filename"

echo "Create d2-docker image: $image_pro"

sudo d2-docker create data "$image_pro" \
    --sql="$sql_filename" \
    --apps-dir=/home/dhis/ip-40/config/files/apps/ \
    --documents-dir=/home/dhis/ip-40/config/files/document/

sudo docker push "$image_pro"
