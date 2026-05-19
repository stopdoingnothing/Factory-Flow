#!/bin/bash
set -e

echo "Installing Puppeteer..."
npm install puppeteer --omit=dev --legacy-peer-deps

echo ""
echo "Running PDF conversion..."
node convert-html-to-pdf.js

echo ""
echo "Cleanup..."
rm -rf node_modules package-lock.json

echo "Done!"
