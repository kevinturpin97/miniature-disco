#!/bin/bash
# Generate self-signed SSL certificates for development/staging use.
# For production, replace with Let's Encrypt or a real certificate.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SSL_DIR="$SCRIPT_DIR/nginx/ssl"

mkdir -p "$SSL_DIR"

if [ -f "$SSL_DIR/cert.pem" ] && [ -f "$SSL_DIR/key.pem" ]; then
    echo "SSL certificates already exist in $SSL_DIR"
    echo "Delete them and re-run this script to regenerate."
    exit 0
fi

echo "Generating self-signed SSL certificate..."

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$SSL_DIR/key.pem" \
    -out "$SSL_DIR/cert.pem" \
    -subj "/C=FR/ST=Local/L=Local/O=Greenhouse SaaS/CN=localhost"

echo "SSL certificates generated in $SSL_DIR"
echo "  - cert.pem (certificate)"
echo "  - key.pem  (private key)"
