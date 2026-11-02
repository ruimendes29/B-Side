#!/bin/sh
# Serve o site em http://127.0.0.1:8888 (os módulos JS não funcionam abrindo o ficheiro diretamente).
cd "$(dirname "$0")"
echo "Abre http://127.0.0.1:8888/ no browser (Ctrl+C para parar)"
python3 -m http.server 8888 --bind 127.0.0.1
