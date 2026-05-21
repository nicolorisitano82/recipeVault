# RecipeVault Android Studio

Questa sottocartella contiene una versione Android apribile direttamente in Android Studio.

## Aprire il progetto

1. Apri Android Studio.
2. Seleziona **Open**.
3. Apri la cartella:

```text
/Users/nicolo/Downloads/recipevault/android-studio
```

## Preparare gli asset web

La UI React viene copiata dentro `app/src/main/assets/web`.

Ogni volta che modifichi il frontend, aggiorna gli asset con:

```bash
cd /Users/nicolo/Downloads/recipevault
npm run android:web
```

## Build in Android Studio

Dopo il sync Gradle puoi eseguire:

- `app` su emulatore o dispositivo
- `Build > Build Bundle(s) / APK(s) > Build APK(s)`

## Note tecniche

- Il progetto usa un wrapper Android nativo con `WebView`, quindi non richiede Rust né Android NDK.
- Le chiamate AI (`Claude` / `OpenAI`) passano da un bridge Kotlin nativo.
- L'export backup salva in Download tramite `MediaStore` su Android recenti.
- L'import JSON continua a usare il picker file del `WebView`.
