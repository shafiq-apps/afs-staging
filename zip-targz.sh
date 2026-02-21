#!/bin/bash

# Get current date and time in format dd-mm-HHMMSS
datetime=$(date +"%d-%m-%H%M%S")

# # Use git to list files excluding .gitignore ones
# files=$(git ls-files)

# Exclude folders
files=$(git ls-files | grep -vE '^(docs/|tests/|public/|storefront/|package.json|package-lock.json|zip-targz.sh|.gitignore|build-production.sh|zip/)')

# Set target directory (one level up)
target_dir="./zip/"

# Create tar.gz in the target directory
tar -czvf "${target_dir}afsv-$datetime.tar.gz" $files

echo "";
echo "***************************************************************";
echo "Created ${target_dir}afsv-$datetime.tar.gz"
echo "***************************************************************";
echo "";
