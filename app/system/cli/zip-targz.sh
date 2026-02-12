#!/bin/bash

# Get current date and time in format dd-mm-HHMMSS
datetime=$(date +"%d-%m-%H%M%S")

# Use git to list files excluding .gitignore ones
files=$(git ls-files)

# Set target directory (one level up)
target_dir="../"

# Create tar.gz in the target directory
tar -czvf "${target_dir}afsv-$datetime.tar.gz" $files

echo "";
echo "***************************************************************";
echo "Created ${target_dir}afsv-$datetime.tar.gz"
echo "***************************************************************";
echo "";
