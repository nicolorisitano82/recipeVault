Questa cartella contiene il runtime desktop di `llama.cpp` per le build Tauri che includono il provider locale dentro l'app.

File attualmente previsto:

- `llama-cli-aarch64-apple-darwin`
- `llama-cli`
- librerie `lib*.dylib` richieste dal sidecar macOS arm64

Nota:

- le build native Apple Silicon (`npm run tauri:dev` e `npm run tauri:build`) usano questa cartella tramite `src-tauri/tauri.sidecar.conf.json`
- il bundle macOS copia le `.dylib` in `Contents/MacOS`, accanto al sidecar `llama-cli`
- le build `x86_64` e `universal` restano per ora senza sidecar incorporato, finché non viene aggiunto anche un binario Intel reale
