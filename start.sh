#!/bin/sh
# Serve o site em modo de desenvolvimento em http://127.0.0.1:8888 (instala as dependências na primeira vez).
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
npm run dev
