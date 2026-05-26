# 🍽 RecipeVault — App Desktop (Tauri + React)

Gestore ricette standalone per macOS con shell Android, import AI da URL e foto, provider locale on-device e organizzazione del ricettario orientata all'uso quotidiano.

---

## 🖼 Screenshot desktop

### Libreria ricette
![Libreria ricette desktop](docs/screenshots/desktop-home.png)

### Dettaglio ricetta
![Dettaglio ricetta desktop](docs/screenshots/desktop-detail.png)

### Configurazione AI
![Configurazione AI desktop](docs/screenshots/desktop-ai-config.png)

---

## 📌 Stato implementazione

Stato aggiornato a maggio 2026.

### Funzioni già disponibili

- Libreria ricette desktop con ricerca, categorie, filtri per ingrediente e vista dettaglio completa
- Import da URL per siti ricette, blog, YouTube, TikTok, Instagram e Facebook
- Import da foto del piatto o di pagine di libri/ricettari
- Inserimento manuale e modifica ricette
- Supporto a ricette con preparazioni separate, ad esempio `base`, `crema`, `farcitura`, `decorazione`
- Lista della spesa generata a partire da una o più ricette selezionate
- Ricerca testuale assistita da AI sulle ricette già salvate
- Provider `Locale (on-device)` come default, più supporto opzionale per Claude e OpenAI
- Pannello `Configurazione AI` con preset, download modelli, gestione spazio occupato e pulizia modelli non usati
- `DEV MODE` sulle ricette importate, con JSON grezzo, output del modello e dati di debug
- Apertura nativa della `Fonte originale` su desktop e Android

### Stato per piattaforma

| Area | Desktop Tauri | Android Studio |
|---|---|---|
| Libreria ricette / CRUD | ✅ Completo | ✅ Completo |
| Importa da URL | ✅ Completo | ✅ Completo |
| Importa da foto con provider esterni | ✅ Completo | ✅ Completo |
| Importa da foto con provider locale | ✅ Completo con modello vision | ⚠️ Non ancora supportato |
| Provider locale testo | ✅ Completo | ✅ Completo |
| Provider locale vision per video | ✅ Completo | ⚠️ Limitato |
| Generazione foto piatto in locale | ✅ Desktop-only | ❌ Non disponibile |
| Gestione spazio modelli | ✅ Completo | ✅ Completo |

### Limiti attuali

- Il provider locale non usa web search esterna: per gli URL lavora sui contenuti realmente estratti dalla pagina, dai sottotitoli o dalla didascalia disponibile
- Su Android il provider locale non supporta ancora l'analisi foto; per quella modalità usa Claude/OpenAI oppure il desktop con modello vision
- La generazione locale della foto del piatto richiede un runtime immagini separato compatibile con `stable-diffusion.cpp`
- Il runtime `llama.cpp` bundlettato vale per le build macOS Apple Silicon; sulle build `x86_64` e `universal` il setup locale resta più manuale

---

## ✅ Prerequisiti (installare una volta sola)

### 1. Xcode Command Line Tools
```bash
xcode-select --install
```

### 2. Homebrew (se non ce l'hai)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 3. Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

### 4. Node.js (v18+)
```bash
brew install node
```

---

## 🚀 Primo avvio (sviluppo)

```bash
# Entra nella cartella del progetto
cd recipevault

# Installa le dipendenze JavaScript
npm install

# Avvia in modalità sviluppo (apre la finestra dell'app)
npm run tauri:dev
```

Al primo avvio Rust compila il backend (~2-3 minuti). I successivi saranno molto più veloci.

---

## 📦 Build finale (app distribuibile)

```bash
npm run tauri:build
```

Trovi il file `.app` in:
```
src-tauri/target/release/bundle/macos/RecipeVault.app
```

Trascinalo in `/Applications` per installarlo come qualsiasi altra app Mac.

### Build per Intel (`x86_64`)

Se vuoi generare una build compatibile con Mac Intel:

```bash
rustup target add x86_64-apple-darwin
npm run tauri:build:x64
```

Output atteso:
```bash
src-tauri/target/x86_64-apple-darwin/release/bundle/macos/RecipeVault.app
```

### Build universale (`arm64` + `x86_64`)

Se vuoi un `.app` unico che giri sia su Apple Silicon sia su Intel:

```bash
rustup target add x86_64-apple-darwin
npm run tauri:build:universal
```

Output atteso:
```bash
src-tauri/target/universal-apple-darwin/release/bundle/macos/RecipeVault.app
```

---

## 🤖 Versione Android Studio

Nel repo trovi anche una versione Android apribile direttamente in Android Studio:

```text
recipevault/android-studio
```

Per aggiornare gli asset web usati dalla `WebView` Android:

```bash
npm run android:web
```

I dettagli di apertura/build sono nel file:

```text
android-studio/README.md
```

---

## ⚙️ Configurazione AI

RecipeVault usa `Locale (on-device)` come provider predefinito. Dal pannello `Configurazione AI` puoi:

- scegliere il provider di default per `import` e `ricerca`
- configurare provider esterni come Claude e OpenAI
- scaricare modelli locali testo, vision, whisper e immagine
- verificare i runtime locali
- controllare lo spazio occupato dai modelli e pulire quelli non usati

### Provider supportati

| Provider | Stato | Note |
|---|---|---|
| `Locale (on-device)` | ✅ Default | Testo locale, import URL, video, foto desktop con modello vision |
| `Claude (Anthropic)` | ✅ Opzionale | Utile come fallback cloud, richiede API key |
| `OpenAI` | ✅ Opzionale | Utile come fallback cloud, richiede API key |

### API key cloud

Se vuoi usare i provider cloud:

| Provider | Dove ottenere la chiave | Prefisso |
|---|---|---|
| **Claude (Anthropic)** | https://console.anthropic.com | `sk-ant-...` |
| **OpenAI** | https://platform.openai.com/api-keys | `sk-proj-...` |

Le chiavi vengono salvate localmente nelle preferenze dell'app.

---

## 💾 Dati e backup

- Le ricette sono salvate in `localStorage` / storage locale dell'app
- I modelli locali vengono scaricati fuori dal repository, nella cartella dati dell'app
- Il pannello `Configurazione AI > Spazio modelli` mostra quanto occupano i modelli e permette di rimuovere quelli non più usati

---

## 📁 Struttura del progetto

```
recipevault/
├── src/
│   ├── main.jsx          # Entry point React
│   ├── App.jsx           # App completa (AI, UI, storage)
│   └── index.css         # Stili globali
├── src-tauri/
│   ├── src/main.rs       # Backend Rust (minimale)
│   ├── Cargo.toml        # Dipendenze Rust
│   ├── build.rs          # Script build Tauri
│   └── tauri.conf.json   # Config Tauri (finestra, CSP, allowlist)
├── index.html            # Entry HTML
├── vite.config.js        # Config Vite bundler
└── package.json          # Dipendenze Node
```

---

## 🐛 Problemi comuni

**"command not found: cargo"**
```bash
source "$HOME/.cargo/env"
```

**Errore compilazione Rust alla prima build**
Normale, aspetta che finisca (~3-5 min). Non interrompere.

**Finestra bianca all'avvio**
Assicurati che `npm run dev` stia girando su porta 5173 prima di `npm run tauri:dev`.

**Errore `target x86_64-apple-darwin not installed`**
```bash
rustup target add x86_64-apple-darwin
```

**Errore API "invalid_api_key"**
Controlla che la chiave non abbia spazi e che corrisponda al provider selezionato.

**Su Android la foto non funziona con il provider locale**
È un limite attuale: per `Importa da foto` usa Claude/OpenAI oppure il desktop con modello vision configurato.

**La generazione foto del piatto non parte in locale**
Controlla nel pannello `Configurazione AI` di avere configurato sia il modello immagine sia un runtime compatibile con `stable-diffusion.cpp`.

---

## 🔄 Aggiornamenti futuri

Per aggiornare l'app dopo modifiche al codice:
```bash
npm run tauri:build
```
E sostituisci il `.app` in `/Applications`.
