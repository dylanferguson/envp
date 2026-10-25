#!/bin/sh
# Runs from /docker-entrypoint.d/ before nginx starts. Cloudflare injects
# X-Origin-Token at the edge; nginx rejects every request without it. Fail
# closed: if the token is missing nginx must not start.
set -eu

if [ -z "${X_ORIGIN_TOKEN:-}" ]; then
	echo "X_ORIGIN_TOKEN is required" >&2
	exit 1
fi
case "$X_ORIGIN_TOKEN" in
*[!A-Za-z0-9_-]*)
	echo "X_ORIGIN_TOKEN must use only letters, digits, - and _" >&2
	exit 1
	;;
esac
# shellcheck disable=SC2016
printf 'map $http_x_origin_token $origin_denied {\n\tdefault 1;\n\t"%s" 0;\n}\n' "$X_ORIGIN_TOKEN" \
	> /etc/nginx/conf.d/origin_token.conf
