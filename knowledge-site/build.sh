#!/bin/bash
cd "$(dirname "$0")"
quarto render .
echo "Site built at _site/"
