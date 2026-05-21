# Modello locale in RecipeVault

RecipeVault ora supporta un provider `Locale (on-device)` sia nella versione Tauri desktop sia nella shell Android.

## Modello consigliato

- Desktop Tauri: `Gemma 3n E2B Instruct` in formato `GGUF` quantizzato 4-bit
- Android: `Gemma 3n E2B` in formato `.task` compatibile MediaPipe / LiteRT

## Desktop Tauri

1. Sulle build macOS Apple Silicon di RecipeVault (`npm run tauri:dev` e `npm run tauri:build`) il runtime `llama.cpp` è già incluso nell'app.
2. In RecipeVault apri `Importa da URL`.
3. Scegli `Locale (on-device)`.
4. Puoi usare `Scarica Gemma 3n E2B` per scaricare automaticamente il file GGUF dentro i dati dell'app.
5. In alternativa puoi inserire manualmente:
   - `Percorso modello locale`: ad esempio `/Users/<utente>/Models/gemma-3n-e2b-it-Q4_K_M.gguf`
   - `Runtime desktop`: lascia `@auto` per usare il runtime incorporato, oppure indica `llama-cli` / un percorso assoluto solo se vuoi forzare un runtime esterno
6. Premi `Verifica modello`.

RecipeVault include anche un piccolo wizard per `llama.cpp`:

- `Rileva llama.cpp` cerca `llama-cli` nel `PATH` e nei percorsi macOS più comuni
- `Copia comando installazione` copia `brew install llama.cpp`
- se il runtime viene trovato, il campo viene aggiornato automaticamente col percorso risolto
- sulle build desktop native del Mac (`npm run tauri:dev` e `npm run tauri:build`) RecipeVault usa automaticamente il sidecar incorporato `@bundled`
- le build `x86_64` e `universal` restano al momento su runtime manuale finché non viene aggiunto un binario Intel reale

## Android

L'inferenza locale Android usa `MediaPipe LLM Inference` e funziona meglio su device reali recenti. Gli emulatori spesso non sono supportati.

La soluzione tecnica consigliata su Android è:

- runtime già integrato nell'APK tramite libreria nativa MediaPipe
- modello `.task` bundlettato negli asset dell'app quando vuoi distribuire tutto in un unico APK
- fallback al download on-demand o a un file `.task` copiato sul device

### Opzione A: modello su filesystem del device

1. Puoi usare `Scarica Gemma 3n E2B` direttamente dall'app: il file `.task` viene salvato nello storage interno di RecipeVault.
2. In alternativa copia il file `.task` sul device, ad esempio:
   - `/data/local/tmp/llm/gemma-3n-e2b.task`
3. In RecipeVault apri `Importa da URL`.
4. Scegli `Locale (on-device)`.
5. Inserisci il percorso del file `.task`.
6. Premi `Verifica modello`.

### Opzione B: modello incluso nel progetto Android

Il bridge supporta anche asset interni tramite schema `asset://`.

1. Copia il file `.task` in:
   - `android-studio/app/src/main/assets/models/`
2. Ricompila l'app Android.
3. In RecipeVault puoi:
   - usare direttamente `@bundled`
   - oppure premere `Usa modello incluso` nel modal locale
4. Premi `Verifica modello`.

Alla prima esecuzione l'asset viene copiato nello storage interno dell'app.

## Sottotitoli YouTube

RecipeVault include `yt-dlp` come sidecar nella build desktop. Per i video YouTube con provider locale, i sottotitoli vengono estratti automaticamente (italiano e inglese) e inclusi nel prompt per il modello. Non serve installare nulla.

## Modello Vision per video (opzionale)

Per estrarre ricette dai video di TikTok, Instagram, Facebook e YouTube tramite analisi visiva:

1. In RecipeVault, nel modal import locale, usa `⬇️ Scarica Qwen2.5-VL 3B Q4` per scaricare automaticamente modello + mmproj (2.78 GB totali).
2. In alternativa scarica manualmente:
   - **Modello**: `Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf` (1.93 GB)
   - **mmproj**: `mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf` (845 MB)
   - Entrambi i file vanno nella stessa cartella
3. Inserisci il percorso del modello GGUF nel campo **Modello vision (opzionale, per video)**. Il file mmproj viene rilevato automaticamente dalla stessa cartella.
4. Quando importi un URL video, RecipeVault:
   - Scarica il video con `yt-dlp` (embedded)
   - Estrae 8 frame con `ffmpeg` (embedded)
   - Passa i frame al modello vision via `llama-mtmd-cli` (embedded) con `--mmproj`
   - Se la vision fallisce, fallback al metodo testo/sottotitoli

Runtime vision: RecipeVault include `llama-mtmd-cli` come sidecar (necessario per modelli multimodali, separato da `llama-cli`).

## Trascrizione audio (fallback Whisper)

Se un video YouTube non ha sottotitoli disponibili, RecipeVault può scaricare l'audio e trascriverlo con Whisper:

1. In RecipeVault, nel modal import locale, usa `⬇️ Scarica Whisper Small` per scaricare il modello (466 MB).
2. Il modello viene salvato in `models/ggml-small.bin` nello storage dell'app.
3. Il fallback è automatico: se `yt-dlp` non trova sottotitoli, RecipeVault:
   - Scarica l'audio con `yt-dlp`
   - Converte in WAV 16kHz con `ffmpeg` (embedded)
   - Trascrive con `whisper-cli` (embedded) in italiano
   - Usa la trascrizione come input per il modello di ricette

RecipeVault include `whisper-cli` come sidecar (compilato staticamente, 3.1 MB, supporto Metal).

## Limiti attuali

- I modelli non sono versionati nel repository: sono troppo grandi per essere committati qui.
- In locale l'import da URL non usa web search esterna: RecipeVault estrae il testo della pagina e lo passa al modello.
- Per social chiusi come TikTok o Instagram senza modello vision, è consigliato incollare la didascalia per migliorare il risultato.
