#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    collections::HashMap,
    fs,
    io::Read,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::Manager;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalAiOptions {
    model_path: String,
    runtime_path: Option<String>,
    vision_model_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiCallPayload {
    provider: String,
    api_key: String,
    model: String,
    prompt: String,
    use_web_search: bool,
    local_options: Option<LocalAiOptions>,
    image_data_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiKeyPayload {
    provider: String,
    api_key: String,
    local_options: Option<LocalAiOptions>,
}

#[derive(Deserialize)]
struct ExportBackupPayload {
    json: String,
}

#[derive(Deserialize)]
struct UrlExtractPayload {
    url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadLocalModelPayload {
    url: String,
    file_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadStatusPayload {
    download_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalRuntimeStatusPayload {
    runtime_path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractedUrlContent {
    title: String,
    text: String,
    image: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalRuntimeStatus {
    found: bool,
    source: String,
    resolved_path: String,
    version: String,
    brew_available: bool,
    suggested_command: String,
    error: String,
}

#[derive(Clone, Default)]
struct DownloadManager {
    entries: Arc<Mutex<HashMap<String, LocalModelDownloadStatus>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalModelDownloadStatus {
    state: String,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    path: String,
    error: String,
}

fn extract_error_message(body: &str, fallback: impl Into<String>) -> String {
    let fallback = fallback.into();

    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(|error| {
                    error
                        .get("message")
                        .and_then(Value::as_str)
                        .or_else(|| error.as_str())
                })
                .or_else(|| value.get("message").and_then(Value::as_str))
                .map(str::to_owned)
        })
        .unwrap_or(fallback)
}

fn collect_text_content(value: &Value) -> String {
    if let Some(text) = value.as_str() {
        return text.to_owned();
    }

    value
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| {
                    part.get("text")
                        .and_then(Value::as_str)
                        .or_else(|| part.as_str())
                })
                .collect::<String>()
        })
        .unwrap_or_default()
}

fn backup_output_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().desktop_dir())
        .or_else(|_| app.path().document_dir())
        .map_err(|_| "Impossibile trovare una cartella adatta per salvare il backup".to_owned())?;

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Impossibile generare il nome del file di backup".to_owned())?
        .as_secs();

    Ok(base_dir.join(format!("recipevault-backup-{ts}.json")))
}

fn local_models_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Impossibile accedere alla cartella dati dell'app".to_owned())?
        .join("models");

    fs::create_dir_all(&dir)
        .map_err(|error| format!("Impossibile creare la cartella modelli: {error}"))?;

    Ok(dir)
}

fn bundled_sidecar_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "llama-cli.exe"
    } else {
        "llama-cli"
    }
}

fn host_target_triple() -> &'static str {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "aarch64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "aarch64-pc-windows-msvc"
    } else {
        "unknown-target"
    }
}

fn sidecar_candidates(app: &tauri::AppHandle, name: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            candidates.push(parent.join(name));
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(name));
    }

    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!("{}-{}", name, host_target_triple())),
    );

    candidates
}

fn bundled_sidecar_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    sidecar_candidates(app, bundled_sidecar_name())
}

fn resolve_sidecar_or_system(app: &tauri::AppHandle, name: &str) -> Option<String> {
    let bin_name = if cfg!(target_os = "windows") { format!("{name}.exe") } else { name.to_owned() };
    for path in sidecar_candidates(app, &bin_name) {
        if path.is_file() {
            return Some(path.display().to_string());
        }
    }
    if let Ok(output) = Command::new("which").arg(name).output() {
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_owned();
            if !p.is_empty() {
                return Some(p);
            }
        }
    }
    None
}

fn resolve_ytdlp(app: &tauri::AppHandle) -> Option<String> {
    resolve_sidecar_or_system(app, "yt-dlp")
}

fn resolve_ffmpeg(app: &tauri::AppHandle) -> Option<String> {
    resolve_sidecar_or_system(app, "ffmpeg")
}

fn resolve_llama_mtmd_cli(app: &tauri::AppHandle) -> Option<String> {
    resolve_sidecar_or_system(app, "llama-mtmd-cli")
}

fn resolve_whisper_cli(app: &tauri::AppHandle) -> Option<String> {
    resolve_sidecar_or_system(app, "whisper-cli")
}

fn find_whisper_model(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(data_dir) = app.path().app_data_dir() {
        let models_dir = data_dir.join("models");
        if let Ok(entries) = fs::read_dir(&models_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if name_str.starts_with("ggml-") && name_str.ends_with(".bin") {
                    return Some(entry.path());
                }
            }
        }
    }
    None
}

struct SocialMetadata {
    title: String,
    description: String,
    thumbnail: String,
}

fn fetch_social_metadata(ytdlp_bin: &str, url: &str) -> Result<SocialMetadata, String> {
    let sep = "<<<SEP>>>";
    let fmt = format!("%(title)s{sep}%(description)s{sep}%(thumbnail)s");
    for browser in &["chrome", "firefox", "edge", "safari"] {
        let out = Command::new(ytdlp_bin)
            .arg("--skip-download")
            .arg("--cookies-from-browser").arg(browser)
            .arg("--print").arg(&fmt)
            .arg("--no-playlist")
            .arg(url)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output();

        if let Ok(result) = out {
            if result.status.success() {
                let stdout = String::from_utf8_lossy(&result.stdout).trim().to_owned();
                let parts: Vec<&str> = stdout.splitn(3, sep).collect();
                let title = parts.first().unwrap_or(&"").to_string();
                let desc = parts.get(1).unwrap_or(&"").to_string();
                let thumb = parts.get(2).unwrap_or(&"").to_string();
                if !title.is_empty() || !desc.is_empty() {
                    eprintln!("[OR-SOCIAL] Metadati estratti con cookies da {browser}");
                    return Ok(SocialMetadata { title, description: desc, thumbnail: thumb });
                }
            }
        }
    }
    Err("Impossibile accedere ai metadati. Assicurati di essere loggato su TikTok/Instagram in Chrome o Firefox.".to_owned())
}

fn collect_downloaded_candidates(dir: &std::path::Path, stem: &str) -> Vec<PathBuf> {
    let mut matches = fs::read_dir(dir)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(|entry| entry.ok().map(|entry| entry.path())))
        .filter(|path| {
            path.is_file()
                && path
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .map(|value| value.starts_with(stem))
                    .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    matches.sort();
    matches
}

fn attempt_audio_download(
    ytdlp_bin: &str,
    url: &str,
    output_template: &std::path::Path,
    format: &str,
    browser: Option<&str>,
) -> Result<PathBuf, String> {
    let parent_dir = output_template
        .parent()
        .ok_or_else(|| "Cartella di destinazione audio non valida".to_owned())?;
    let stem = output_template
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Nome file audio non valido".to_owned())?;

    let mut cmd = Command::new(ytdlp_bin);
    cmd.arg("-f")
        .arg(format)
        .arg("--no-playlist")
        .arg("--socket-timeout")
        .arg("15")
        .arg("--retries")
        .arg("2")
        .arg("--print")
        .arg("after_move:filepath")
        .arg("-o")
        .arg(output_template.to_string_lossy().as_ref())
        .arg(url);

    if let Some(browser_name) = browser {
        cmd.arg("--cookies-from-browser").arg(browser_name);
    }

    let (status, stdout, stderr) = run_command_with_timeout(
        cmd,
        Duration::from_secs(90),
        "Timeout durante il download audio del video.",
    )?;

    if !status.success() {
        let detail = String::from_utf8_lossy(&stderr).trim().to_owned();
        let stdout_detail = String::from_utf8_lossy(&stdout).trim().to_owned();
        return Err(if !detail.is_empty() {
            detail
        } else if !stdout_detail.is_empty() {
            stdout_detail
        } else {
            "yt-dlp non è riuscito a scaricare l'audio".to_owned()
        });
    }

    let stdout_text = String::from_utf8_lossy(&stdout);
    for line in stdout_text.lines().rev() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let candidate = PathBuf::from(trimmed);
        if candidate.exists() && candidate.is_file() {
            return Ok(candidate);
        }
    }

    collect_downloaded_candidates(parent_dir, stem)
        .into_iter()
        .next()
        .ok_or_else(|| "Download audio completato ma file finale non trovato".to_owned())
}

fn download_audio_with_ytdlp(
    ytdlp_bin: &str,
    url: &str,
    output_path: &std::path::Path,
    use_cookies: bool,
) -> Result<PathBuf, String> {
    let formats = &[
        "bestaudio/best",
        "ba[ext=m4a]/ba",
        "ba",
        "worstaudio/worst[ext=mp4]/worst",
    ];
    let output_template = output_path.with_extension("%(ext)s");
    let mut errors: Vec<String> = Vec::new();

    if use_cookies {
        for browser in &["chrome", "firefox", "safari", "edge"] {
            for fmt in formats {
                match attempt_audio_download(ytdlp_bin, url, &output_template, fmt, Some(browser)) {
                    Ok(path) => {
                        eprintln!("[OR-YTDLP] Audio scaricato con cookies da {browser} (fmt={fmt})");
                        return Ok(path);
                    }
                    Err(error) => errors.push(format!("{browser} / {fmt}: {error}")),
                }
            }
        }
        eprintln!("[OR-YTDLP] Tentativo senza cookies come fallback audio…");
    }

    for fmt in formats {
        match attempt_audio_download(ytdlp_bin, url, &output_template, fmt, None) {
            Ok(path) => {
                eprintln!("[OR-YTDLP] Audio scaricato (fmt={fmt})");
                return Ok(path);
            }
            Err(error) => errors.push(format!("public / {fmt}: {error}")),
        }
    }

    let detail = errors
        .into_iter()
        .rev()
        .find(|error| !error.contains("Requested format is not available"))
        .unwrap_or_else(|| "yt-dlp: nessun formato audio/video disponibile".to_owned());

    if use_cookies {
        Err(format!("Download audio fallito anche dopo fallback pubblico: {detail}"))
    } else {
        Err(detail)
    }
}

fn transcribe_audio_file(
    ffmpeg_bin: &str,
    whisper_bin: &str,
    whisper_model: &str,
    audio_path: &std::path::Path,
) -> Result<String, String> {
    let wav_path = audio_path.with_extension("wav");

    let conv = Command::new(ffmpeg_bin)
        .arg("-i").arg(audio_path.to_string_lossy().as_ref())
        .arg("-ar").arg("16000")
        .arg("-ac").arg("1")
        .arg("-f").arg("wav")
        .arg(wav_path.to_string_lossy().as_ref())
        .arg("-y")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("ffmpeg errore: {e}"))?;

    if !conv.status.success() {
        let stderr = String::from_utf8_lossy(&conv.stderr);
        return Err(format!("ffmpeg errore: {}", stderr.trim()));
    }

    let whisper = Command::new(whisper_bin)
        .arg("-m").arg(whisper_model)
        .arg("-f").arg(wav_path.to_string_lossy().as_ref())
        .arg("-l").arg("auto")
        .arg("--no-timestamps")
        .arg("-np")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("whisper-cli errore: {e}"))?;

    let _ = fs::remove_file(&wav_path);

    let stdout = String::from_utf8_lossy(&whisper.stdout).trim().to_owned();
    if stdout.is_empty() {
        return Err("whisper-cli non ha prodotto trascrizione".to_owned());
    }
    Ok(stdout)
}

fn fetch_youtube_audio_transcript(
    ytdlp_bin: &str,
    ffmpeg_bin: &str,
    whisper_bin: &str,
    whisper_model: &str,
    url: &str,
) -> Result<String, String> {
    let tmp_dir = std::env::temp_dir().join("recipevault_whisper");
    let _ = fs::create_dir_all(&tmp_dir);

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let audio_path = tmp_dir.join(format!("audio_{ts}.m4a"));

    let downloaded_audio = download_audio_with_ytdlp(ytdlp_bin, url, &audio_path, false)?;

    let result = transcribe_audio_file(ffmpeg_bin, whisper_bin, whisper_model, &downloaded_audio);
    let _ = fs::remove_file(&downloaded_audio);
    result
}

fn fetch_social_audio_transcript(
    ytdlp_bin: &str,
    ffmpeg_bin: &str,
    whisper_bin: &str,
    whisper_model: &str,
    url: &str,
) -> Result<String, String> {
    let tmp_dir = std::env::temp_dir().join("recipevault_whisper");
    let _ = fs::create_dir_all(&tmp_dir);

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let audio_path = tmp_dir.join(format!("social_{ts}.m4a"));

    eprintln!("[OR-SOCIAL] Avvio download audio…");
    let downloaded_audio = download_audio_with_ytdlp(ytdlp_bin, url, &audio_path, true)?;
    eprintln!("[OR-SOCIAL] Audio scaricato, avvio trascrizione whisper…");

    let result = transcribe_audio_file(ffmpeg_bin, whisper_bin, whisper_model, &downloaded_audio);
    let _ = fs::remove_file(&downloaded_audio);
    result
}

fn auto_detect_mmproj(model_path: &str) -> Option<PathBuf> {
    let model = std::path::Path::new(model_path);
    let dir = model.parent()?;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.starts_with("mmproj-") && name_str.ends_with(".gguf") {
                return Some(entry.path());
            }
        }
    }
    None
}

fn set_download_status(
    manager: &DownloadManager,
    download_id: &str,
    status: LocalModelDownloadStatus,
) {
    if let Ok(mut entries) = manager.entries.lock() {
        entries.insert(download_id.to_owned(), status);
    }
}

fn get_download_status(
    manager: &DownloadManager,
    download_id: &str,
) -> Result<LocalModelDownloadStatus, String> {
    manager
        .entries
        .lock()
        .map_err(|_| "Impossibile leggere lo stato del download".to_owned())?
        .get(download_id)
        .cloned()
        .ok_or_else(|| "Download modello non trovato".to_owned())
}

fn local_options_or_error(local_options: &Option<LocalAiOptions>) -> Result<LocalAiOptions, String> {
    local_options
        .clone()
        .ok_or_else(|| "Configurazione del modello locale mancante".to_owned())
}

fn validate_local_model_path(model_path: &str) -> Result<PathBuf, String> {
    let trimmed = model_path.trim();
    if trimmed.is_empty() {
        return Err("Percorso del modello locale mancante".to_owned());
    }

    let path = PathBuf::from(trimmed);
    if !path.exists() {
        return Err(format!("Modello locale non trovato: {}", path.display()));
    }

    if !path.is_file() {
        return Err(format!("Il percorso del modello non punta a un file: {}", path.display()));
    }

    Ok(path)
}

fn validate_local_vision_model_path(local_options: &LocalAiOptions) -> Result<PathBuf, String> {
    let vision_model_path = local_options
        .vision_model_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Per analizzare una foto in locale serve configurare anche il Modello vision.".to_owned())?;

    validate_local_model_path(vision_model_path)
}

fn parse_data_url(data_url: &str) -> Result<(String, String), String> {
    let trimmed = data_url.trim();
    let (meta, data) = trimmed
        .split_once(',')
        .ok_or_else(|| "Formato immagine non valido".to_owned())?;

    if !meta.starts_with("data:") || !meta.ends_with(";base64") {
        return Err("Formato immagine non supportato".to_owned());
    }

    let media_type = meta
        .trim_start_matches("data:")
        .trim_end_matches(";base64")
        .trim()
        .to_owned();

    if media_type.is_empty() {
        return Err("Tipo MIME immagine non valido".to_owned());
    }

    Ok((media_type, data.trim().to_owned()))
}

fn image_extension_from_media_type(media_type: &str) -> &'static str {
    match media_type {
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "jpg",
    }
}

fn write_data_url_image_to_temp(data_url: &str) -> Result<PathBuf, String> {
    let (media_type, base64_data) = parse_data_url(data_url)?;
    let bytes = BASE64_STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|error| format!("Immagine base64 non valida: {error}"))?;
    let temp_dir = std::env::temp_dir().join("recipevault_images");
    fs::create_dir_all(&temp_dir)
        .map_err(|error| format!("Impossibile creare la cartella temporanea immagini: {error}"))?;

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let file_path = temp_dir.join(format!(
        "photo_{ts}.{}",
        image_extension_from_media_type(&media_type)
    ));

    fs::write(&file_path, bytes)
        .map_err(|error| format!("Impossibile salvare temporaneamente la foto: {error}"))?;

    Ok(file_path)
}

fn local_runtime_path(options: &LocalAiOptions) -> String {
    options
        .runtime_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("llama-cli")
        .to_owned()
}

fn normalize_runtime_hint(runtime_hint: Option<&str>) -> String {
    let hint = runtime_hint.map(str::trim).unwrap_or_default();
    if hint.is_empty() || hint == "llama-cli" {
        "@auto".to_owned()
    } else {
        hint.to_owned()
    }
}

fn check_local_runtime(runtime_path: &str) -> Result<(), String> {
    let output = Command::new(runtime_path)
        .arg("--version")
        .output()
        .map_err(|error| format!("Runtime locale non disponibile ({runtime_path}): {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        return Err(if detail.is_empty() {
            format!("Runtime locale non disponibile ({runtime_path})")
        } else {
            format!("Runtime locale non disponibile ({runtime_path}): {detail}")
        });
    }

    Ok(())
}

fn read_child_stream<R>(mut stream: R) -> thread::JoinHandle<Vec<u8>>
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stream.read_to_end(&mut buffer);
        buffer
    })
}

fn run_command_with_timeout(
    mut cmd: Command,
    timeout: Duration,
    timeout_message: &str,
) -> Result<(std::process::ExitStatus, Vec<u8>, Vec<u8>), String> {
    let started_at = Instant::now();
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Errore eseguendo il comando esterno: {error}"))?;

    let stdout_reader = child
        .stdout
        .take()
        .map(read_child_stream)
        .ok_or_else(|| "Impossibile leggere lo stdout del comando esterno".to_owned())?;
    let stderr_reader = child
        .stderr
        .take()
        .map(read_child_stream)
        .ok_or_else(|| "Impossibile leggere lo stderr del comando esterno".to_owned())?;

    let status = loop {
        match child
            .try_wait()
            .map_err(|error| format!("Errore monitorando il comando esterno: {error}"))?
        {
            Some(status) => break status,
            None => {
                if Instant::now().duration_since(started_at) > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(timeout_message.to_owned());
                }
                thread::sleep(Duration::from_millis(200));
            }
        }
    };

    Ok((
        status,
        stdout_reader.join().unwrap_or_default(),
        stderr_reader.join().unwrap_or_default(),
    ))
}

fn resolve_bundled_runtime(app: &tauri::AppHandle) -> Option<PathBuf> {
    bundled_sidecar_candidates(app)
        .into_iter()
        .find(|candidate| {
            candidate.exists()
                && candidate.is_file()
                && check_local_runtime(&candidate.display().to_string()).is_ok()
        })
}

fn resolve_runtime_command(app: &tauri::AppHandle, runtime_hint: Option<&str>) -> Result<(String, String), String> {
    let hint = normalize_runtime_hint(runtime_hint);

    if hint == "@bundled" {
        if let Some(path) = resolve_bundled_runtime(app) {
            return Ok((path.display().to_string(), "bundled".to_owned()));
        }

        return Err("Runtime incorporato non trovato in questa build desktop".to_owned());
    }

    if hint == "@auto" {
        if let Some(path) = resolve_bundled_runtime(app) {
            return Ok((path.display().to_string(), "bundled".to_owned()));
        }

        for candidate in runtime_candidates(None) {
            if check_local_runtime(&candidate).is_ok() {
                return Ok((candidate, "system".to_owned()));
            }
        }

        return Err("Nessun runtime llama.cpp trovato né incorporato né nel sistema".to_owned());
    }

    let command = hint;
    Ok((command.to_owned(), "manual".to_owned()))
}

fn runtime_candidates(runtime_hint: Option<&str>) -> Vec<String> {
    let mut candidates = Vec::new();
    if let Some(hint) = runtime_hint.map(str::trim).filter(|value| !value.is_empty()) {
        candidates.push(hint.to_owned());
    }
    for candidate in [
        "llama-cli",
        "/opt/homebrew/bin/llama-cli",
        "/usr/local/bin/llama-cli",
    ] {
        if !candidates.iter().any(|existing| existing == candidate) {
            candidates.push(candidate.to_owned());
        }
    }
    candidates
}

fn brew_available() -> bool {
    Command::new("brew")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn detect_runtime_version(runtime_path: &str) -> String {
    let output = Command::new(runtime_path).arg("--version").output();
    match output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
            if !stdout.is_empty() {
                stdout
            } else if !stderr.is_empty() {
                stderr
            } else {
                "Versione non disponibile".to_owned()
            }
        }
        _ => "Versione non disponibile".to_owned(),
    }
}

fn local_runtime_status(app: &tauri::AppHandle, runtime_hint: Option<&str>) -> LocalRuntimeStatus {
    let brew = brew_available();
    let suggested_command = "brew install llama.cpp".to_owned();
    let normalized_hint = normalize_runtime_hint(runtime_hint);

    if matches!(normalized_hint.as_str(), "@bundled" | "@auto") {
        if let Some(path) = resolve_bundled_runtime(app) {
            return LocalRuntimeStatus {
                found: true,
                source: "bundled".to_owned(),
                resolved_path: path.display().to_string(),
                version: detect_runtime_version(&path.display().to_string()),
                brew_available: brew,
                suggested_command,
                error: String::new(),
            };
        }

        if normalized_hint == "@bundled" {
            return LocalRuntimeStatus {
                found: false,
                source: String::new(),
                resolved_path: String::new(),
                version: String::new(),
                brew_available: brew,
                suggested_command,
                error: "Runtime incorporato non trovato in questa build desktop".to_owned(),
            };
        }
    }

    for candidate in runtime_candidates(runtime_hint) {
        if check_local_runtime(&candidate).is_ok() {
            return LocalRuntimeStatus {
                found: true,
                source: "system".to_owned(),
                resolved_path: candidate.clone(),
                version: detect_runtime_version(&candidate),
                brew_available: brew,
                suggested_command,
                error: String::new(),
            };
        }
    }

    LocalRuntimeStatus {
        found: false,
        source: String::new(),
        resolved_path: String::new(),
        version: String::new(),
        brew_available: brew,
        suggested_command,
        error: "Runtime llama.cpp non trovato. Installa `llama-cli` o inserisci il percorso assoluto del binario.".to_owned(),
    }
}

fn html_decode(input: &str) -> String {
    input
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn regex_replace(pattern: &str, input: &str, replacement: &str) -> String {
    Regex::new(pattern)
        .expect("regex valida")
        .replace_all(input, replacement)
        .into_owned()
}

fn capture_first_group(pattern: &str, input: &str) -> Option<String> {
    Regex::new(pattern)
        .ok()
        .and_then(|regex| regex.captures(input))
        .and_then(|captures| captures.get(1).map(|group| html_decode(group.as_str().trim())))
        .filter(|value| !value.is_empty())
}

fn capture_meta_content(input: &str, key: &str) -> Option<String> {
    let escaped = regex::escape(key);
    let direct = format!(
        r#"(?is)<meta[^>]+(?:property|name)\s*=\s*["']{escaped}["'][^>]+content\s*=\s*["']([^"']+)["']"#
    );
    let reverse = format!(
        r#"(?is)<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+(?:property|name)\s*=\s*["']{escaped}["']"#
    );

    capture_first_group(&direct, input).or_else(|| capture_first_group(&reverse, input))
}

fn value_has_type(value: &Value, wanted: &str) -> bool {
    match value {
        Value::String(kind) => kind.eq_ignore_ascii_case(wanted),
        Value::Array(items) => items.iter().any(|item| value_has_type(item, wanted)),
        _ => false,
    }
}

fn find_recipe_ldjson<'a>(value: &'a Value) -> Option<&'a Value> {
    if value
        .get("@type")
        .map(|kind| value_has_type(kind, "Recipe"))
        .unwrap_or(false)
    {
        return Some(value);
    }

    if let Some(graph) = value.get("@graph").and_then(Value::as_array) {
        for item in graph {
            if let Some(found) = find_recipe_ldjson(item) {
                return Some(found);
            }
        }
    }

    if let Some(items) = value.as_array() {
        for item in items {
            if let Some(found) = find_recipe_ldjson(item) {
                return Some(found);
            }
        }
    }

    None
}

fn push_unique_line(lines: &mut Vec<String>, value: &str) {
    let trimmed = html_decode(value.trim());
    if trimmed.is_empty() {
        return;
    }
    if !lines.iter().any(|line| line.eq_ignore_ascii_case(&trimmed)) {
        lines.push(trimmed);
    }
}

fn collect_recipe_instruction_lines(value: &Value, lines: &mut Vec<String>) {
    match value {
        Value::String(text) => push_unique_line(lines, text),
        Value::Array(items) => {
            for item in items {
                collect_recipe_instruction_lines(item, lines);
            }
        }
        Value::Object(map) => {
            if let Some(text) = map.get("text").and_then(Value::as_str) {
                push_unique_line(lines, text);
            } else if let Some(name) = map.get("name").and_then(Value::as_str) {
                push_unique_line(lines, name);
            }

            if let Some(item_list) = map.get("itemListElement") {
                collect_recipe_instruction_lines(item_list, lines);
            }
        }
        _ => {}
    }
}

fn extract_recipe_ldjson_text(html: &str) -> Option<String> {
    let regex = Regex::new(
        r#"(?is)<script[^>]+type\s*=\s*["']application/ld\+json["'][^>]*>(.*?)</script>"#,
    )
    .ok()?;

    for captures in regex.captures_iter(html) {
        let raw_json = captures.get(1)?.as_str().trim();
        let parsed = match serde_json::from_str::<Value>(raw_json) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let recipe = match find_recipe_ldjson(&parsed) {
            Some(recipe) => recipe,
            None => continue,
        };

        let mut sections: Vec<String> = Vec::new();

        if let Some(name) = recipe.get("name").and_then(Value::as_str) {
            sections.push(format!("Recipe title: {}", html_decode(name)));
        }

        if let Some(description) = recipe.get("description").and_then(Value::as_str) {
            sections.push(format!("Description:\n{}", html_decode(description)));
        }

        let ingredients = recipe
            .get("recipeIngredient")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(html_decode)
                    .filter(|item| !item.is_empty())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        if !ingredients.is_empty() {
            sections.push(format!("Ingredients:\n- {}", ingredients.join("\n- ")));
        }

        let mut instructions: Vec<String> = Vec::new();
        if let Some(recipe_instructions) = recipe.get("recipeInstructions") {
            collect_recipe_instruction_lines(recipe_instructions, &mut instructions);
        }

        if !instructions.is_empty() {
            sections.push(format!(
                "Instructions:\n{}",
                instructions
                    .iter()
                    .enumerate()
                    .map(|(index, step)| format!("{}. {}", index + 1, step))
                    .collect::<Vec<_>>()
                    .join("\n")
            ));
        }

        if !sections.is_empty() {
            return Some(truncate_chars(&sections.join("\n\n"), 6_000));
        }
    }

    None
}

fn truncate_chars(input: &str, max_chars: usize) -> String {
    input.chars().take(max_chars).collect()
}

fn primary_content_html(html: &str) -> String {
    capture_first_group(r"(?is)<article\b[^>]*>(.*?)</article>", html)
        .or_else(|| capture_first_group(r"(?is)<main\b[^>]*>(.*?)</main>", html))
        .unwrap_or_else(|| html.to_owned())
}

fn strip_html_text(html: &str) -> String {
    let primary_html = primary_content_html(html);
    let without_noise = regex_replace(
        r"(?is)<!--.*?-->|<script[^>]*>.*?</script>|<style[^>]*>.*?</style>|<noscript[^>]*>.*?</noscript>|<(?:header|nav|footer|aside|form|button|svg)[^>]*>.*?</(?:header|nav|footer|aside|form|button|svg)>",
        &primary_html,
        " ",
    );
    let with_breaks = regex_replace(r"(?i)<\s*(br|/p|/div|/section|/article|/li|/ul|/ol|/h[1-6]|/tr|/td|/th)\s*>", &without_noise, "\n");
    let no_tags = regex_replace(r"(?is)<[^>]+>", &with_breaks, " ");
    let decoded = html_decode(&no_tags);
    let compact_spaces = regex_replace(r"[ \t\x0B\x0C\r]+", &decoded, " ");
    let compact_lines = regex_replace(r"\n\s*\n+", &compact_spaces, "\n\n");
    truncate_chars(compact_lines.trim(), 6_000)
}

async fn call_claude(client: &Client, payload: &AiCallPayload) -> Result<String, String> {
    let content = if let Some(image_data_url) = payload
        .image_data_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let (media_type, data) = parse_data_url(image_data_url)?;
        json!([
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": data,
                }
            },
            {
                "type": "text",
                "text": payload.prompt,
            }
        ])
    } else {
        json!([{ "type": "text", "text": payload.prompt }])
    };

    let mut body = json!({
        "model": payload.model,
        "max_tokens": 2048,
        "messages": [{
            "role": "user",
            "content": content,
        }],
    });

    if payload.use_web_search {
        body["tools"] = json!([{ "type": "web_search_20250305", "name": "web_search" }]);
    }

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &payload.api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Errore di rete Anthropic: {error}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Errore leggendo la risposta Anthropic: {error}"))?;

    if !status.is_success() {
        return Err(extract_error_message(
            &body,
            format!("Anthropic HTTP {}", status.as_u16()),
        ));
    }

    let json: Value = serde_json::from_str(&body)
        .map_err(|error| format!("Risposta Anthropic non valida: {error}"))?;

    Ok(json
        .get("content")
        .and_then(Value::as_array)
        .map(|blocks| {
            blocks
                .iter()
                .filter(|block| block.get("type").and_then(Value::as_str) == Some("text"))
                .filter_map(|block| block.get("text").and_then(Value::as_str))
                .collect::<String>()
        })
        .unwrap_or_default())
}

async fn call_openai(client: &Client, payload: &AiCallPayload) -> Result<String, String> {
    let model = if payload.use_web_search {
        "gpt-4o-search-preview"
    } else {
        payload.model.as_str()
    };

    let content = if let Some(image_data_url) = payload
        .image_data_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        json!([
            {
                "type": "text",
                "text": payload.prompt,
            },
            {
                "type": "image_url",
                "image_url": {
                    "url": image_data_url,
                }
            }
        ])
    } else {
        json!(payload.prompt)
    };

    let body = json!({
        "model": model,
        "max_tokens": 2048,
        "messages": [{
            "role": "user",
            "content": content,
        }],
    });

    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(&payload.api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Errore di rete OpenAI: {error}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Errore leggendo la risposta OpenAI: {error}"))?;

    if !status.is_success() {
        return Err(extract_error_message(
            &body,
            format!("OpenAI HTTP {}", status.as_u16()),
        ));
    }

    let json: Value = serde_json::from_str(&body)
        .map_err(|error| format!("Risposta OpenAI non valida: {error}"))?;

    Ok(json
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .map(collect_text_content)
        .unwrap_or_default())
}

async fn call_local(app: &tauri::AppHandle, payload: &AiCallPayload) -> Result<String, String> {
    if let Some(image_data_url) = payload
        .image_data_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return call_local_vision(app, payload, image_data_url).await;
    }

    let local_options = local_options_or_error(&payload.local_options)?;
    let model_path = validate_local_model_path(&local_options.model_path)?;
    let runtime_hint = local_runtime_path(&local_options);
    let (runtime_path, _) = resolve_runtime_command(app, Some(&runtime_hint))?;
    check_local_runtime(&runtime_path)?;

    let prompt = payload.prompt.clone();
    let model_path_string = model_path.to_string_lossy().to_string();

    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let mut child = Command::new(&runtime_path)
            .arg("-m")
            .arg(&model_path_string)
            .arg("-c")
            .arg("8192")
            .arg("-n")
            .arg("2048")
            .arg("--temp")
            .arg("0.2")
            .arg("--single-turn")
            .arg("--no-display-prompt")
            .arg("--no-show-timings")
            .arg("--log-disable")
            .arg("--simple-io")
            .arg("-p")
            .arg(&prompt)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Errore eseguendo il runtime locale: {error}"))?;

        let stdout_reader = child
            .stdout
            .take()
            .map(read_child_stream)
            .ok_or_else(|| "Impossibile leggere l'output del runtime locale".to_owned())?;
        let stderr_reader = child
            .stderr
            .take()
            .map(read_child_stream)
            .ok_or_else(|| "Impossibile leggere gli errori del runtime locale".to_owned())?;

        let status = loop {
            match child
                .try_wait()
                .map_err(|error| format!("Errore monitorando il runtime locale: {error}"))?
            {
                Some(status) => break status,
                None => {
                    if Instant::now().duration_since(started_at) > Duration::from_secs(180) {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(
                            "Il modello locale non ha risposto entro 180 secondi. Prova con una pagina più breve o un modello più leggero."
                                .to_owned(),
                        );
                    }
                    thread::sleep(Duration::from_millis(200));
                }
            }
        };

        let stdout = String::from_utf8_lossy(&stdout_reader.join().unwrap_or_default())
            .trim()
            .replace("<|im_end|>", "")
            .replace("<|endoftext|>", "")
            .replace("<end_of_turn>", "")
            .trim()
            .to_owned();
        let stderr = String::from_utf8_lossy(&stderr_reader.join().unwrap_or_default())
            .trim()
            .to_owned();

        if !status.success() {
            let detail = if !stderr.is_empty() { stderr } else { stdout };
            return Err(if detail.is_empty() {
                format!("Il runtime locale è terminato con codice {:?}", status.code())
            } else {
                detail
            });
        }

        if stdout.is_empty() {
            return Err("Il modello locale non ha restituito testo".to_owned());
        }

        Ok(stdout)
    })
    .await
    .map_err(|error| format!("Errore nel task del modello locale: {error}"))?
}

async fn call_local_vision(
    app: &tauri::AppHandle,
    payload: &AiCallPayload,
    image_data_url: &str,
) -> Result<String, String> {
    let local_options = local_options_or_error(&payload.local_options)?;
    let vision_model = validate_local_vision_model_path(&local_options)?;
    let vision_model_str = vision_model.to_string_lossy().to_string();
    let mtmd_cli_path = resolve_llama_mtmd_cli(app)
        .ok_or_else(|| "llama-mtmd-cli non trovato. Necessario per il modello vision.".to_owned())?;
    let mmproj_path = auto_detect_mmproj(&vision_model_str)
        .ok_or_else(|| format!(
            "File mmproj non trovato nella stessa cartella del modello vision ({}). Scarica mmproj-*.gguf e posizionalo accanto al modello.",
            vision_model.parent().map(|p| p.display().to_string()).unwrap_or_default()
        ))?;
    let mmproj_str = mmproj_path.display().to_string();
    let prompt = payload.prompt.clone();
    let image_path = write_data_url_image_to_temp(image_data_url)?;

    tauri::async_runtime::spawn_blocking(move || {
        let result = call_vision_model(
            &mtmd_cli_path,
            &vision_model_str,
            &mmproj_str,
            &prompt,
            &[image_path.clone()],
        );
        let _ = fs::remove_file(&image_path);
        result
    })
    .await
    .map_err(|error| format!("Errore nel task del modello vision: {error}"))?
}

async fn fetch_url_content(client: &Client, url: &str) -> Result<ExtractedUrlContent, String> {
    let response = client
        .get(url)
        .header(
            reqwest::header::USER_AGENT,
            "RecipeVault/1.0 (+https://recipevault.local)",
        )
        .send()
        .await
        .map_err(|error| format!("Errore recuperando la pagina: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("Impossibile leggere l'URL (HTTP {})", status.as_u16()));
    }

    let html = response
        .text()
        .await
        .map_err(|error| format!("Errore leggendo il contenuto dell'URL: {error}"))?;

    let title = capture_meta_content(&html, "og:title")
        .or_else(|| capture_first_group(r"(?is)<title[^>]*>(.*?)</title>", &html))
        .unwrap_or_default();
    let image = capture_meta_content(&html, "og:image").unwrap_or_default();
    let schema_recipe_text = extract_recipe_ldjson_text(&html);
    let page_text = strip_html_text(&html);
    let text = if let Some(schema_text) = schema_recipe_text {
        truncate_chars(&format!("{schema_text}\n\n{page_text}"), 12_000)
    } else {
        page_text
    };

    Ok(ExtractedUrlContent { title, text, image })
}

fn extract_transcript_from_json3(json_path: &std::path::Path) -> Option<String> {
    let data: Value = serde_json::from_str(&fs::read_to_string(json_path).ok()?).ok()?;
    let events = data.get("events")?.as_array()?;
    let mut parts: Vec<String> = Vec::new();
    for event in events {
        if let Some(segs) = event.get("segs").and_then(Value::as_array) {
            for seg in segs {
                if let Some(t) = seg.get("utf8").and_then(Value::as_str) {
                    let trimmed = t.trim();
                    if !trimmed.is_empty() {
                        parts.push(trimmed.to_owned());
                    }
                }
            }
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

fn fetch_youtube_transcript(ytdlp_bin: &str, url: &str) -> Result<String, String> {
    let tmp_dir = std::env::temp_dir().join("recipevault_yt");
    let _ = fs::create_dir_all(&tmp_dir);

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let out_template = tmp_dir.join(format!("sub_{ts}"));

    let mut cmd = Command::new(ytdlp_bin);
    cmd.arg("--skip-download")
        .arg("--write-auto-sub")
        .arg("--sub-lang")
        .arg("it,en")
        .arg("--sub-format")
        .arg("json3")
        .arg("--no-playlist")
        .arg("--socket-timeout")
        .arg("15")
        .arg("--retries")
        .arg("2")
        .arg("-o")
        .arg(out_template.to_string_lossy().as_ref())
        .arg(url);

    let (status, _stdout, stderr) = run_command_with_timeout(
        cmd,
        Duration::from_secs(45),
        "Timeout estraendo i sottotitoli da YouTube. Prova di nuovo o usa un altro link.",
    )?;

    let it_path = out_template.with_extension("it.json3");
    let en_path = out_template.with_extension("en.json3");

    let transcript = extract_transcript_from_json3(&it_path)
        .or_else(|| extract_transcript_from_json3(&en_path));

    let _ = fs::remove_file(&it_path);
    let _ = fs::remove_file(&en_path);

    transcript.ok_or_else(|| {
        let detail = String::from_utf8_lossy(&stderr).trim().to_owned();
        if !status.success() && !detail.is_empty() {
            format!("Nessun sottotitolo trovato per questo video: {detail}")
        } else {
            "Nessun sottotitolo trovato per questo video".to_owned()
        }
    })
}

fn extract_video_frames(ytdlp_bin: &str, ffmpeg_bin: &str, url: &str, max_frames: u32) -> Result<Vec<PathBuf>, String> {
    let tmp_dir = std::env::temp_dir().join("recipevault_frames");
    let _ = fs::create_dir_all(&tmp_dir);

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let video_path = tmp_dir.join(format!("video_{ts}.mp4"));

    let mut download_cmd = Command::new(ytdlp_bin);
    download_cmd
        .arg("-f")
        .arg("worst[ext=mp4]/worst")
        .arg("--no-playlist")
        .arg("--socket-timeout")
        .arg("15")
        .arg("--retries")
        .arg("2")
        .arg("-o")
        .arg(video_path.to_string_lossy().as_ref())
        .arg(url);

    let (dl_status, _dl_stdout, dl_stderr) = run_command_with_timeout(
        download_cmd,
        Duration::from_secs(90),
        "Timeout scaricando il video. Prova di nuovo o usa un link con sottotitoli/testo disponibile.",
    )?;

    if !dl_status.success() {
        let stderr = String::from_utf8_lossy(&dl_stderr);
        return Err(format!("Download video fallito: {}", stderr.trim()));
    }

    if !video_path.exists() {
        return Err("Video non scaricato".to_owned());
    }

    let frames_dir = tmp_dir.join(format!("frames_{ts}"));
    let _ = fs::create_dir_all(&frames_dir);
    let frame_pattern = frames_dir.join("frame_%03d.jpg");

    let interval = format!("1/{}", max_frames);
    let mut ffmpeg_cmd = Command::new(ffmpeg_bin);
    ffmpeg_cmd
        .arg("-i")
        .arg(video_path.to_string_lossy().as_ref())
        .arg("-vf")
        .arg(format!("fps={},scale=512:-1", interval))
        .arg("-frames:v")
        .arg(max_frames.to_string())
        .arg("-q:v")
        .arg("6")
        .arg(frame_pattern.to_string_lossy().as_ref())
        .arg("-y");

    let ffmpeg_result = run_command_with_timeout(
        ffmpeg_cmd,
        Duration::from_secs(60),
        "Timeout estraendo i frame dal video.",
    );

    let _ = fs::remove_file(&video_path);

    match ffmpeg_result {
        Ok((status, _stdout, _stderr)) if status.success() => {
            let mut frames: Vec<PathBuf> = fs::read_dir(&frames_dir)
                .map_err(|e| format!("Errore leggendo i frame: {e}"))?
                .filter_map(|e| e.ok().map(|e| e.path()))
                .filter(|p| p.extension().map_or(false, |ext| ext == "jpg"))
                .collect();
            frames.sort();
            if frames.is_empty() {
                Err("Nessun frame estratto dal video".to_owned())
            } else {
                Ok(frames)
            }
        }
        Ok((_status, _stdout, stderr)) => {
            let detail = String::from_utf8_lossy(&stderr).trim().to_owned();
            if detail.is_empty() {
                Err("Errore durante l'estrazione dei frame dal video".to_owned())
            } else {
                Err(format!("Errore durante l'estrazione dei frame dal video: {detail}"))
            }
        }
        Err(error) => Err(error),
    }
}

fn call_vision_model(
    mtmd_cli_path: &str,
    model_path: &str,
    mmproj_path: &str,
    prompt: &str,
    image_paths: &[PathBuf],
) -> Result<String, String> {
    let mut cmd = Command::new(mtmd_cli_path);
    cmd.arg("-m")
        .arg(model_path)
        .arg("--mmproj")
        .arg(mmproj_path)
        .arg("-c")
        .arg("8192")
        .arg("-n")
        .arg("2048")
        .arg("--temp")
        .arg("0.2")
        .arg("--single-turn")
        .arg("--no-display-prompt")
        .arg("--no-show-timings")
        .arg("--log-disable")
        .arg("--simple-io");

    for img in image_paths {
        cmd.arg("--image").arg(img.to_string_lossy().as_ref());
    }

    cmd.arg("-p").arg(prompt);

    let started_at = Instant::now();
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Errore avviando il modello vision: {e}"))?;

    let stdout_reader = child
        .stdout
        .take()
        .map(read_child_stream)
        .ok_or_else(|| "Impossibile leggere output modello vision".to_owned())?;

    let status = loop {
        match child
            .try_wait()
            .map_err(|e| format!("Errore monitorando modello vision: {e}"))?
        {
            Some(status) => break status,
            None => {
                if Instant::now().duration_since(started_at) > Duration::from_secs(300) {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("Il modello vision non ha risposto entro 5 minuti".to_owned());
                }
                thread::sleep(Duration::from_millis(200));
            }
        }
    };

    let stdout = String::from_utf8_lossy(&stdout_reader.join().unwrap_or_default())
        .trim()
        .replace("<|im_end|>", "")
        .replace("<|endoftext|>", "")
        .replace("<end_of_turn>", "")
        .trim()
        .to_owned();

    if !status.success() || stdout.is_empty() {
        return Err("Il modello vision non ha prodotto output".to_owned());
    }

    Ok(stdout)
}

async fn run_local_model_download(
    manager: DownloadManager,
    download_id: String,
    url: String,
    target_path: PathBuf,
) {
    let client = Client::new();
    let temp_path = target_path.with_extension("download");

    let response = client
        .get(&url)
        .header(
            reqwest::header::USER_AGENT,
            "RecipeVault/1.0 (+https://recipevault.local)",
        )
        .send()
        .await;

    let mut response = match response {
        Ok(response) => response,
        Err(error) => {
            set_download_status(
                &manager,
                &download_id,
                LocalModelDownloadStatus {
                    state: "error".to_owned(),
                    downloaded_bytes: 0,
                    total_bytes: None,
                    path: String::new(),
                    error: format!("Errore avviando il download del modello: {error}"),
                },
            );
            return;
        }
    };

    let status = response.status();
    if !status.is_success() {
        set_download_status(
            &manager,
            &download_id,
            LocalModelDownloadStatus {
                state: "error".to_owned(),
                downloaded_bytes: 0,
                total_bytes: None,
                path: String::new(),
                error: format!("Download modello fallito (HTTP {})", status.as_u16()),
            },
        );
        return;
    }

    let total_bytes = response.content_length();
    set_download_status(
        &manager,
        &download_id,
        LocalModelDownloadStatus {
            state: "downloading".to_owned(),
            downloaded_bytes: 0,
            total_bytes,
            path: String::new(),
            error: String::new(),
        },
    );

    let file_result = fs::File::create(&temp_path)
        .map_err(|error| format!("Impossibile creare il file temporaneo del modello: {error}"));
    let mut file = match file_result {
        Ok(file) => file,
        Err(error) => {
            set_download_status(
                &manager,
                &download_id,
                LocalModelDownloadStatus {
                    state: "error".to_owned(),
                    downloaded_bytes: 0,
                    total_bytes,
                    path: String::new(),
                    error,
                },
            );
            return;
        }
    };

    let mut downloaded_bytes = 0_u64;
    while let Some(chunk) = match response.chunk().await {
        Ok(chunk) => chunk,
        Err(error) => {
            let _ = fs::remove_file(&temp_path);
            set_download_status(
                &manager,
                &download_id,
                LocalModelDownloadStatus {
                    state: "error".to_owned(),
                    downloaded_bytes,
                    total_bytes,
                    path: String::new(),
                    error: format!("Errore durante il download del modello: {error}"),
                },
            );
            return;
        }
    } {
        if let Err(error) = file.write_all(&chunk) {
            let _ = fs::remove_file(&temp_path);
            set_download_status(
                &manager,
                &download_id,
                LocalModelDownloadStatus {
                    state: "error".to_owned(),
                    downloaded_bytes,
                    total_bytes,
                    path: String::new(),
                    error: format!("Errore scrivendo il modello su disco: {error}"),
                },
            );
            return;
        }

        downloaded_bytes += chunk.len() as u64;
        set_download_status(
            &manager,
            &download_id,
            LocalModelDownloadStatus {
                state: "downloading".to_owned(),
                downloaded_bytes,
                total_bytes,
                path: String::new(),
                error: String::new(),
            },
        );
    }

    if let Err(error) = file.flush() {
        let _ = fs::remove_file(&temp_path);
        set_download_status(
            &manager,
            &download_id,
            LocalModelDownloadStatus {
                state: "error".to_owned(),
                downloaded_bytes,
                total_bytes,
                path: String::new(),
                error: format!("Errore finalizzando il file del modello: {error}"),
            },
        );
        return;
    }

    if let Err(error) = fs::rename(&temp_path, &target_path) {
        let _ = fs::remove_file(&temp_path);
        set_download_status(
            &manager,
            &download_id,
            LocalModelDownloadStatus {
                state: "error".to_owned(),
                downloaded_bytes,
                total_bytes,
                path: String::new(),
                error: format!("Impossibile finalizzare il modello scaricato: {error}"),
            },
        );
        return;
    }

    set_download_status(
        &manager,
        &download_id,
        LocalModelDownloadStatus {
            state: "completed".to_owned(),
            downloaded_bytes,
            total_bytes: Some(downloaded_bytes),
            path: target_path.display().to_string(),
            error: String::new(),
        },
    );
}

fn next_download_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("local-model-{millis}")
}

#[tauri::command]
async fn start_local_model_download(
    app: tauri::AppHandle,
    manager: tauri::State<'_, DownloadManager>,
    payload: DownloadLocalModelPayload,
) -> Result<String, String> {
    let url = payload.url.trim();
    let file_name = payload.file_name.trim();
    if url.is_empty() || file_name.is_empty() {
        return Err("Configurazione download modello incompleta".to_owned());
    }

    let target_dir = local_models_dir(&app)?;
    let target_path = target_dir.join(file_name);
    let download_id = next_download_id();

    if target_path.exists() && target_path.metadata().map(|meta| meta.len()).unwrap_or(0) > 0 {
        set_download_status(
            manager.inner(),
            &download_id,
            LocalModelDownloadStatus {
                state: "completed".to_owned(),
                downloaded_bytes: target_path.metadata().map(|meta| meta.len()).unwrap_or(0),
                total_bytes: target_path.metadata().ok().map(|meta| meta.len()),
                path: target_path.display().to_string(),
                error: String::new(),
            },
        );
        return Ok(download_id);
    }

    set_download_status(
        manager.inner(),
        &download_id,
        LocalModelDownloadStatus {
            state: "starting".to_owned(),
            downloaded_bytes: 0,
            total_bytes: None,
            path: String::new(),
            error: String::new(),
        },
    );

    let manager = manager.inner().clone();
    let url = url.to_owned();
    let download_id_for_task = download_id.clone();
    tauri::async_runtime::spawn(async move {
        run_local_model_download(manager, download_id_for_task, url, target_path).await;
    });

    Ok(download_id)
}

#[tauri::command]
async fn call_ai(app: tauri::AppHandle, payload: AiCallPayload) -> Result<String, String> {
    let client = Client::new();

    match payload.provider.as_str() {
        "claude" => call_claude(&client, &payload).await,
        "openai" => call_openai(&client, &payload).await,
        "local" => call_local(&app, &payload).await,
        _ => Err("Provider AI non supportato".to_owned()),
    }
}

#[tauri::command]
async fn test_api_key(app: tauri::AppHandle, payload: ApiKeyPayload) -> Result<bool, String> {
    let client = Client::new();

    let response = match payload.provider.as_str() {
        "claude" => client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &payload.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&json!({
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 5,
                "messages": [{ "role": "user", "content": "Hi" }],
            }))
            .send()
            .await
            .map_err(|error| format!("Errore di rete Anthropic: {error}"))?,
        "openai" => client
            .get("https://api.openai.com/v1/models")
            .bearer_auth(&payload.api_key)
            .send()
            .await
            .map_err(|error| format!("Errore di rete OpenAI: {error}"))?,
        "local" => {
            let local_options = local_options_or_error(&payload.local_options)?;
            validate_local_model_path(&local_options.model_path)?;
            let runtime_hint = local_runtime_path(&local_options);
            let (runtime_path, _) = resolve_runtime_command(&app, Some(&runtime_hint))?;
            check_local_runtime(&runtime_path)?;
            return Ok(true);
        }
        _ => return Err("Provider AI non supportato".to_owned()),
    };

    Ok(response.status().is_success())
}

#[tauri::command]
async fn extract_url_content(payload: UrlExtractPayload) -> Result<ExtractedUrlContent, String> {
    let client = Client::new();
    fetch_url_content(&client, payload.url.trim()).await
}

#[derive(Serialize)]
struct YtTranscriptResult {
    transcript: String,
    found: bool,
}

#[tauri::command]
async fn extract_youtube_transcript(app: tauri::AppHandle, payload: UrlExtractPayload) -> Result<YtTranscriptResult, String> {
    let ytdlp_bin = resolve_ytdlp(&app)
        .ok_or_else(|| "yt-dlp non trovato".to_owned())?;
    let ffmpeg_bin = resolve_ffmpeg(&app);
    let whisper_bin = resolve_whisper_cli(&app);
    let whisper_model = find_whisper_model(&app).map(|p| p.display().to_string());
    let url = payload.url.trim().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        if let Ok(transcript) = fetch_youtube_transcript(&ytdlp_bin, &url) {
            return Ok(YtTranscriptResult { transcript, found: true });
        }

        if let (Some(ffmpeg), Some(whisper), Some(model)) = (&ffmpeg_bin, &whisper_bin, &whisper_model) {
            eprintln!("[OR-WHISPER] Sottotitoli non disponibili, fallback trascrizione audio…");
            match fetch_youtube_audio_transcript(&ytdlp_bin, ffmpeg, whisper, model, &url) {
                Ok(transcript) => return Ok(YtTranscriptResult { transcript, found: true }),
                Err(e) => eprintln!("[OR-WHISPER] Fallback audio fallito: {e}"),
            }
        }

        Ok(YtTranscriptResult { transcript: String::new(), found: false })
    })
    .await
    .map_err(|e| format!("Errore nel task transcript: {e}"))?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SocialContentResult {
    title: String,
    description: String,
    thumbnail: String,
    transcript: String,
    found: bool,
}

#[tauri::command]
async fn fetch_social_preview(app: tauri::AppHandle, payload: UrlExtractPayload) -> Result<SocialContentResult, String> {
    let ytdlp_bin = resolve_ytdlp(&app)
        .ok_or_else(|| "yt-dlp non trovato".to_owned())?;
    let url = payload.url.trim().to_owned();

    tauri::async_runtime::spawn_blocking(move || {
        match fetch_social_metadata(&ytdlp_bin, &url) {
            Ok(meta) => Ok(SocialContentResult {
                title: meta.title,
                description: meta.description,
                thumbnail: meta.thumbnail,
                transcript: String::new(),
                found: true,
            }),
            Err(_) => Ok(SocialContentResult {
                title: String::new(),
                description: String::new(),
                thumbnail: String::new(),
                transcript: String::new(),
                found: false,
            }),
        }
    })
    .await
    .map_err(|e| format!("Errore nel task social preview: {e}"))?
}

#[tauri::command]
async fn extract_social_transcript(app: tauri::AppHandle, payload: UrlExtractPayload) -> Result<SocialContentResult, String> {
    let ytdlp_bin = resolve_ytdlp(&app)
        .ok_or_else(|| "yt-dlp non trovato".to_owned())?;
    let ffmpeg_bin = resolve_ffmpeg(&app);
    let whisper_bin = resolve_whisper_cli(&app);
    let whisper_model = find_whisper_model(&app).map(|p| p.display().to_string());
    let url = payload.url.trim().to_owned();

    tauri::async_runtime::spawn_blocking(move || {
        let mut result = SocialContentResult {
            title: String::new(),
            description: String::new(),
            thumbnail: String::new(),
            transcript: String::new(),
            found: false,
        };

        if let Ok(meta) = fetch_social_metadata(&ytdlp_bin, &url) {
            eprintln!("[OR-SOCIAL] Metadati ottenuti: titolo={}, desc={} chars", meta.title.len(), meta.description.len());
            result.title = meta.title;
            result.description = meta.description;
            result.thumbnail = meta.thumbnail;
            result.found = true;
        }

        if let (Some(ffmpeg), Some(whisper), Some(model)) = (&ffmpeg_bin, &whisper_bin, &whisper_model) {
            eprintln!("[OR-SOCIAL] Scarico audio per trascrizione…");
            match fetch_social_audio_transcript(&ytdlp_bin, ffmpeg, whisper, model, &url) {
                Ok(t) => {
                    let preview: String = t.chars().take(200).collect();
                    eprintln!("[OR-SOCIAL] Trascrizione audio ottenuta: {} chars — «{preview}»", t.len());
                    result.transcript = t;
                    result.found = true;
                }
                Err(e) => eprintln!("[OR-SOCIAL] Trascrizione fallita: {e}"),
            }
        }

        Ok(result)
    })
    .await
    .map_err(|e| format!("Errore nel task social: {e}"))?
}

#[tauri::command]
fn get_local_runtime_status(
    app: tauri::AppHandle,
    payload: LocalRuntimeStatusPayload,
) -> Result<LocalRuntimeStatus, String> {
    Ok(local_runtime_status(&app, payload.runtime_path.as_deref()))
}

#[tauri::command]
fn get_local_model_download_status(
    manager: tauri::State<'_, DownloadManager>,
    payload: DownloadStatusPayload,
) -> Result<LocalModelDownloadStatus, String> {
    get_download_status(manager.inner(), payload.download_id.trim())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VideoImportPayload {
    url: String,
    vision_model_path: String,
    #[allow(dead_code)]
    runtime_path: Option<String>,
    max_frames: Option<u32>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VideoFrameAnalysisResult {
    visual_summary: String,
    on_screen_text: Vec<String>,
    key_moments: Vec<String>,
    found: bool,
}

#[tauri::command]
async fn import_video_frames(app: tauri::AppHandle, payload: VideoImportPayload) -> Result<VideoFrameAnalysisResult, String> {
    let ytdlp_bin = resolve_ytdlp(&app)
        .ok_or_else(|| "yt-dlp non trovato".to_owned())?;
    let ffmpeg_bin = resolve_ffmpeg(&app)
        .ok_or_else(|| "ffmpeg non trovato".to_owned())?;
    let vision_model = validate_local_model_path(&payload.vision_model_path)?;
    let vision_model_str = vision_model.to_string_lossy().to_string();

    let mtmd_cli_path = resolve_llama_mtmd_cli(&app)
        .ok_or_else(|| "llama-mtmd-cli non trovato. Necessario per il modello vision.".to_owned())?;

    let mmproj_path = auto_detect_mmproj(&vision_model_str)
        .ok_or_else(|| format!(
            "File mmproj non trovato nella stessa cartella del modello vision ({}). \
             Scarica mmproj-*.gguf e posizionalo accanto al modello.",
            vision_model.parent().map(|p| p.display().to_string()).unwrap_or_default()
        ))?;
    let mmproj_str = mmproj_path.display().to_string();

    let max_frames = payload.max_frames.unwrap_or(8);
    let url = payload.url.trim().to_owned();

    tauri::async_runtime::spawn_blocking(move || {
        let frames = extract_video_frames(&ytdlp_bin, &ffmpeg_bin, &url, max_frames)?;

        let prompt = format!(
            "Sei un assistente culinario che analizza frame di un video di cucina.\n\
             Osserva queste immagini e ricava SOLO le informazioni visive realmente supportate dai frame.\n\
             1. Estrai il testo leggibile on-screen (titoli, ingredienti, quantità, step, sottotitoli brevi).\n\
             2. Descrivi cosa succede nel video in ordine temporale: ingredienti mostrati, azioni, cotture, cambi di stato.\n\
             3. Evidenzia eventuali ingredienti o dosi visibili nei frame anche se compaiono come testo sovraimpresso.\n\
             4. Non inventare dettagli non presenti nei frame.\n\
             Rispondi SOLO con JSON valido:\n\
             {{\"visualSummary\":\"breve riassunto testuale di ciò che accade nel video\",\
             \"onScreenText\":[\"testo rilevato nei frame\"],\
             \"keyMoments\":[\"passaggio visivo in ordine temporale\"],\
             \"found\":true}}\n\
             URL sorgente: {url}"
        );

        let result = call_vision_model(&mtmd_cli_path, &vision_model_str, &mmproj_str, &prompt, &frames)?;
        let parsed = serde_json::from_str::<VideoFrameAnalysisResult>(&result).unwrap_or_else(|_| VideoFrameAnalysisResult {
            visual_summary: result.trim().to_owned(),
            on_screen_text: Vec::new(),
            key_moments: Vec::new(),
            found: !result.trim().is_empty(),
        });

        for frame in &frames {
            let _ = fs::remove_file(frame);
        }

        Ok(parsed)
    })
    .await
    .map_err(|e| format!("Errore nel task video: {e}"))?
}

#[tauri::command]
fn export_backup(app: tauri::AppHandle, payload: ExportBackupPayload) -> Result<String, String> {
    let path = backup_output_path(&app)?;
    fs::write(&path, payload.json)
        .map_err(|error| format!("Errore salvando il backup: {error}"))?;
    Ok(path.display().to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(DownloadManager::default())
        .invoke_handler(tauri::generate_handler![
            call_ai,
            test_api_key,
            extract_url_content,
            extract_youtube_transcript,
            fetch_social_preview,
            extract_social_transcript,
            import_video_frames,
            get_local_runtime_status,
            start_local_model_download,
            get_local_model_download_status,
            export_backup
        ])
        .run(tauri::generate_context!())
        .expect("Errore durante l'avvio di RecipeVault");
}
