use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const STEAM_API_URL: &str = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";
const BATCH_SIZE: usize = 100;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SteamModDetail {
    mod_id: String,
    name: Option<String>,
    #[serde(rename = "type")]
    mod_type: String,
    last_updated: Option<String>,
    steam_url: String,
    steam_size: u64,
    preview_url: Option<String>,
    error: bool,
}

impl SteamModDetail {
    fn error(mod_id: &str) -> Self {
        Self {
            mod_id: mod_id.to_string(),
            name: None,
            mod_type: "Unknown".to_string(),
            last_updated: None,
            steam_url: format!("https://steamcommunity.com/sharedfiles/filedetails/?id={mod_id}"),
            steam_size: 0,
            preview_url: None,
            error: true,
        }
    }
}

#[derive(Debug, Deserialize)]
struct SteamApiResponse {
    response: Option<SteamApiInner>,
}

#[derive(Debug, Deserialize)]
struct SteamApiInner {
    publishedfiledetails: Option<Vec<SteamFileDetail>>,
}

#[derive(Debug, Deserialize)]
struct SteamFileDetail {
    result: i32,
    publishedfileid: String,
    title: Option<String>,
    tags: Option<Vec<SteamTag>>,
    time_updated: Option<i64>,
    #[serde(default)]
    file_size: Option<serde_json::Value>,
    preview_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum SteamTag {
    Object { tag: String },
    Plain(String),
}

impl SteamTag {
    fn value(&self) -> String {
        match self {
            SteamTag::Object { tag } => tag.to_lowercase(),
            SteamTag::Plain(s) => s.to_lowercase(),
        }
    }
}

fn extract_mod_type(tags: &Option<Vec<SteamTag>>) -> String {
    let Some(tags) = tags else {
        return "Mod".to_string();
    };
    let values: Vec<String> = tags.iter().map(|t| t.value()).collect();
    let has = |needle: &str| values.iter().any(|v| v == needle);

    if has("total conversion") {
        "Total Conversion"
    } else if has("map") {
        "Map"
    } else if has("structures") {
        "Structures"
    } else if has("creatures") {
        "Creatures"
    } else if has("gameplay") {
        "Gameplay"
    } else if has("stack mod") {
        "Stack Mod"
    } else if has("utilities") {
        "Utility"
    } else if has("graphics") {
        "Graphics"
    } else {
        "Mod"
    }
    .to_string()
}

fn parse_file_size(v: &Option<serde_json::Value>) -> u64 {
    match v {
        Some(serde_json::Value::String(s)) => s.parse().unwrap_or(0),
        Some(serde_json::Value::Number(n)) => n.as_u64().unwrap_or(0),
        _ => 0,
    }
}

#[tauri::command]
async fn fetch_steam_mod_details(mod_ids: Vec<String>) -> Result<HashMap<String, SteamModDetail>, String> {
    let client = reqwest::Client::new();
    let mut results: HashMap<String, SteamModDetail> = HashMap::new();

    for batch in mod_ids.chunks(BATCH_SIZE) {
        let mut params: Vec<(String, String)> = vec![("itemcount".to_string(), batch.len().to_string())];
        for (idx, id) in batch.iter().enumerate() {
            params.push((format!("publishedfileids[{idx}]"), id.clone()));
        }

        let res = client.post(STEAM_API_URL).form(&params).send().await;

        match res {
            Ok(resp) if resp.status().is_success() => match resp.json::<SteamApiResponse>().await {
                Ok(parsed) => {
                    let details = parsed
                        .response
                        .and_then(|r| r.publishedfiledetails)
                        .unwrap_or_default();
                    for item in details {
                        if item.result == 1 {
                            results.insert(
                                item.publishedfileid.clone(),
                                SteamModDetail {
                                    mod_id: item.publishedfileid.clone(),
                                    name: item.title,
                                    mod_type: extract_mod_type(&item.tags),
                                    last_updated: item.time_updated.map(|t| {
                                        chrono_like_iso(t)
                                    }),
                                    steam_url: format!(
                                        "https://steamcommunity.com/sharedfiles/filedetails/?id={}",
                                        item.publishedfileid
                                    ),
                                    steam_size: parse_file_size(&item.file_size),
                                    preview_url: item.preview_url,
                                    error: false,
                                },
                            );
                        } else {
                            results.insert(item.publishedfileid.clone(), SteamModDetail::error(&item.publishedfileid));
                        }
                    }
                }
                Err(err) => {
                    eprintln!("Steam response parse error: {err}");
                    for id in batch {
                        results.entry(id.clone()).or_insert_with(|| SteamModDetail::error(id));
                    }
                }
            },
            Ok(resp) => {
                eprintln!("Steam API error: HTTP {}", resp.status());
                for id in batch {
                    results.entry(id.clone()).or_insert_with(|| SteamModDetail::error(id));
                }
            }
            Err(err) => {
                eprintln!("Steam fetch error: {err}");
                for id in batch {
                    results.entry(id.clone()).or_insert_with(|| SteamModDetail::error(id));
                }
            }
        }
    }

    Ok(results)
}

/// Minimal Unix-timestamp -> ISO8601 (UTC) formatter, avoiding an extra `chrono` dependency.
fn chrono_like_iso(unix_secs: i64) -> String {
    let dur = std::time::Duration::from_secs(unix_secs.max(0) as u64);
    let datetime = UNIX_EPOCH + dur;
    humantime_like_rfc3339(datetime)
}

fn humantime_like_rfc3339(t: std::time::SystemTime) -> String {
    // Convert to a simple RFC3339-ish string using days-since-epoch math (UTC only).
    let secs = t.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let days = secs / 86400;
    let rem = secs % 86400;
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);

    // Civil-from-days algorithm (Howard Hinnant), proleptic Gregorian, UTC.
    let z = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m_num = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m_num <= 2 { y + 1 } else { y };

    format!("{y:04}-{m_num:02}-{d:02}T{h:02}:{m:02}:{s:02}.000Z")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModFolderInfo {
    size: u64,
    last_downloaded: String,
    path: String,
}

fn get_folder_size(dir: &Path) -> u64 {
    let mut total = 0u64;
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if let Ok(meta) = entry.metadata() {
            if meta.is_dir() {
                total += get_folder_size(&path);
            } else {
                total += meta.len();
            }
        }
    }
    total
}

fn get_mod_folder_info(mods_dir: &str, mod_id: &str) -> Option<ModFolderInfo> {
    let mod_path = Path::new(mods_dir).join(mod_id);
    let meta = fs::metadata(&mod_path).ok()?;
    if !meta.is_dir() {
        return None;
    }
    let modified = meta.modified().ok()?;
    Some(ModFolderInfo {
        size: get_folder_size(&mod_path),
        last_downloaded: humantime_like_rfc3339(modified),
        path: mod_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn get_mod_folder_infos(mods_dir: String, mod_ids: Vec<String>) -> HashMap<String, Option<ModFolderInfo>> {
    mod_ids
        .into_iter()
        .map(|id| {
            let info = get_mod_folder_info(&mods_dir, &id);
            (id, info)
        })
        .collect()
}

#[tauri::command]
fn get_default_mods_path() -> String {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));

    let mut candidates: Vec<PathBuf> = Vec::new();
    
    for drive in &["C", "D", "E", "F"] {
        candidates.push(PathBuf::from(format!(
            r"{}:\Program Files (x86)\Steam\steamapps\common\ARK\ShooterGame\Content\Mods",
            drive
        )));
        // Direct root library alternate format
        candidates.push(PathBuf::from(format!(
            r"{}:\SteamLibrary\steamapps\common\ARK\ShooterGame\Content\Mods",
            drive
        )));
    }

    candidates.push(home.join(".steam/steam/steamapps/common/ARK/ShooterGame/Content/Mods"));
    candidates.push(home.join("Library/Application Support/Steam/steamapps/common/ARK/ShooterGame/Content/Mods"));

    for candidate in &candidates {
        if candidate.exists() && candidate.is_dir() {
            return candidate.to_string_lossy().to_string();
        }
    }

    // Default backstop fallback
    home.to_string_lossy().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_steam_mod_details,
            get_mod_folder_infos,
            get_default_mods_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
