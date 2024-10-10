#!/bin/bash
set -e -u -o pipefail

cd "$(dirname "$0")"
source "./auth.sh"

version=$(curl -sS -u "$auth" http://localhost/api/system/info.json | jq -r .version | sed "s/2\.4/4/")
name="docker.eyeseetea.com/eyeseetea/dhis2-data:$version-sp-ip-pro"
sql_filename="/tmp/db.sql.gz"

cd /tmp
echo "Dump DB: $name -> $sql_filename"
sudo -u postgres pg_dump dhis2 | gzip >"$sql_filename"

echo "Create d2-docker image: $name"
sudo d2-docker create data --sql="$sql_filename" "$name" \
    --apps-dir=/home/dhis/ip-40/config/files/apps/ \
    --documents-dir=/home/dhis/ip-40/config/files/document/
sudo docker push "$name"
