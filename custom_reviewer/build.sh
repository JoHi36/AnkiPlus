#!/bin/bash
# Build Tailwind + DaisyUI CSS for the Reviewer
# Run from any directory — paths are absolute
cd "$(dirname "$0")/../frontend"
npx tailwindcss \
    -i ../custom_reviewer/tailwind.input.css \
    -o ../custom_reviewer/reviewer.css \
    --config ../custom_reviewer/tailwind.config.js \
    "$@"
echo "✅ reviewer.css built"
