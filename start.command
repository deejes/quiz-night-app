#!/bin/bash
# Double-click this file to start Quiz Night — Live.
# It launches the server and opens the big-screen page in your browser.
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "First-time setup: installing dependencies (needs internet, ~20s)…"
  npm install || { echo "npm install failed. Make sure Node.js is installed."; read -n1; exit 1; }
fi

# open the big screen once the server has a moment to boot
( sleep 1.5; open "http://localhost:3000/host" ) &
node server.js
