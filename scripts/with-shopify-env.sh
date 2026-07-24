#!/bin/sh
set -eu

start_dir=${INIT_CWD:-$(pwd)}
start_parent=${start_dir%/*}
env_file=""
for candidate in "$start_dir/.shopify-poc.env" "$start_parent/.shopify-poc.env"; do
  if [ -f "$candidate" ]; then env_file=$candidate; break; fi
done
if [ -n "$env_file" ]; then
  set -a
  . "$env_file"
  set +a
fi
exec "$@"
