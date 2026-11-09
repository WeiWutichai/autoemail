#!/bin/sh
# Starts nginx and reloads it every 6 hours so renewed certificates are picked up.
(while :; do sleep 6h; nginx -s reload; done) &
exec /docker-entrypoint.sh nginx -g 'daemon off;'
