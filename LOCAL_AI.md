# Modello locale in RecipeVault

RecipeVault ora supporta un provider `Locale (on-device)` sia nella versione Tauri desktop sia nella shell Android.

## Preset consigliati

- Desktop Tauri: `Gemma 3n E4B Instruct` in formato `GGUF` quantizzato 4-bit come preset `Alta qualità`
- Desktop fallback: `Gemma 3n E2B Instruct` come preset `Bilanciato`
- Android default: `Gemma 3n E2B` in formato `.task` compatibile MediaPipe / LiteRT
- Android opzionale: `Gemma 3n E4B` come preset `Alta qualità`, consigliato solo su device recenti

## Desktop Tauri

1. Sulle build macOS Apple Silicon di RecipeVault (`npm run tauri:dev` e `npm run tauri:build`) il runtime `llama.cpp` è già incluso nell'app.
2. In RecipeVault apri `Importa da URL`.
3. Scegli `Locale (on-device)`.
4. Puoi usare `Scarica Gemma 3n E4B` per il preset desktop consigliato, oppure `Scarica Gemma 3n E2B` se preferisci il profilo bilanciato.
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

### Generazione immagine locale del piatto

Per le ricette importate da libro puoi generare una foto realistica del piatto finale anche senza OpenAI, usando un runtime locale separato:

1. Apri `⚙️ Configurazione AI`.
2. Nel blocco `Componenti comuni`, compila:
   - `Generazione immagini locale (desktop)` → percorso del modello immagine locale
   - `@auto oppure /percorso/sd-cli` → runtime compatibile con `stable-diffusion.cpp`
3. Puoi usare `⬇️ Scarica SDXL Turbo` per scaricare automaticamente il checkpoint ufficiale nel data directory dell'app.
4. Dopo il download, il percorso del modello viene compilato automaticamente.
5. Torna su una ricetta importata da libro e usa `🖼️ Genera foto piatto`.

RecipeVault in questa fase si aspetta un runtime `sd-cli` compatibile con `stable-diffusion.cpp`, che secondo la documentazione ufficiale espone `--model`, `--prompt` e `--output` per la generazione `img_gen`.

Il preset scaricato di default è `SDXL Turbo`, che secondo la documentazione ufficiale è pensato per generare immagini in 1-4 step.

Riferimenti ufficiali:

- `stable-diffusion.cpp` supporta modelli `GGUF`, `safetensors` e `ckpt/pth/pt`
- quick start ufficiale: `./bin/sd-cli -m ../models/v1-5-pruned-emaonly.safetensors -p "a lovely cat"`

Nota: il runtime immagine non è ancora bundlettato dentro RecipeVault come `llama.cpp`, quindi al momento va installato o copiato separatamente sul desktop.

## Android

L'inferenza locale Android usa `MediaPipe LLM Inference` e funziona meglio su device reali recenti. Gli emulatori spesso non sono supportati.

La soluzione tecnica consigliata su Android è:

- runtime già integrato nell'APK tramite libreria nativa MediaPipe
- modello `.task` bundlettato negli asset dell'app quando vuoi distribuire tutto in un unico APK
- fallback al download on-demand o a un file `.task` copiato sul device

### Opzione A: modello su filesystem del device

1. Puoi usare `Scarica Gemma 3n E2B` direttamente dall'app: è il preset Android consigliato e il file `.task` viene salvato nello storage interno di RecipeVault.
2. Se hai un device potente puoi selezionare `Gemma 3n E4B — Alta qualità` e scaricare anche quel `.task`, ma è più pesante in RAM, storage e tempi di risposta.
3. In alternativa copia il file `.task` sul device, ad esempio:
   - `/data/local/tmp/llm/gemma-3n-e2b.task`
4. In RecipeVault apri `Importa da URL`.
5. Scegli `Locale (on-device)`.
6. Seleziona il preset locale desiderato (`Bilanciato` o `Alta qualità`).
7. Inserisci il percorso del file `.task`.
8. Premi `Verifica modello`.

### Opzione B: modello incluso nel progetto Android

Il bridge supporta anche asset interni tramite schema `asset://`.

1. Copia il file `.task` in:
   - `android-studio/app/src/main/assets/models/`
2. Se vuoi supportare sia E2B sia E4B, puoi inserire entrambi i file: RecipeVault proverà a scegliere quello coerente con il preset selezionato.
3. Ricompila l'app Android.
4. In RecipeVault puoi:
   - usare direttamente `@bundled`
   - oppure premere `Usa modello incluso` nel modal locale
5. Premi `Verifica modello`.

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
- La generazione immagine locale del piatto è supportata solo su desktop Tauri. Su Android non è ancora disponibile.
