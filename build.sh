#!/bin/bash
# Build a clean extension zip for Chrome Web Store submission
# Excludes tests, dev docs, git files, and other non-production artifacts

set -e

OUTPUT="tab-junkie.zip"
rm -f "$OUTPUT"

zip -r "$OUTPUT" . \
  -x ".*" \
  -x "__MACOSX/*" \
  -x "*.zip" \
  -x "tests/*" \
  -x "docs/*" \
  -x "build.sh" \
  -x "CONTRIBUTING.md" \
  -x "node_modules/*"

echo ""
echo "Built $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
echo ""
echo "Contents:"
unzip -l "$OUTPUT" | tail -1
