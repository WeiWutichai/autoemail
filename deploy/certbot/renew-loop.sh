#!/bin/sh
# Renews Let's Encrypt certificates every 12 hours (no-op until a certificate is close to expiry).
trap exit TERM
while :; do
  certbot renew --webroot -w /var/www/certbot --quiet
  sleep 12h &
  wait
done
