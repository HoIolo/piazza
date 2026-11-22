use base64::Engine;
use serde::Serialize;
use std::io::{Read, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    path: String,
    name: String,
    size: u64,
    mime_type: Option<&'static str>,
    data: Option<String>,
}

fn image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Some("image/webp")
    } else {
        None
    }
}

#[tauri::command]
pub fn read_attachment(path: String) -> Result<Attachment, String> {
    let path = std::fs::canonicalize(&path).map_err(|e| format!("无法打开附件：{e}"))?;
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let mut attachment = Attachment {
        path: path.to_string_lossy().into_owned(),
        name,
        size: metadata.len(),
        mime_type: None,
        data: None,
    };
    if metadata.is_dir() {
        return Ok(attachment);
    }
    if !metadata.is_file() {
        return Err("请选择普通文件或文件夹".into());
    }
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut header = [0u8; 12];
    let count = file.read(&mut header).map_err(|e| e.to_string())?;
    let Some(mime) = image_mime(&header[..count]) else {
        return Ok(attachment);
    };
    if metadata.len() > MAX_BYTES {
        return Err("图片不能超过 20 MB".into());
    }
    let mut bytes = header[..count].to_vec();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("图片不能超过 20 MB".into());
    }
    attachment.mime_type = Some(mime);
    attachment.data = Some(base64::engine::general_purpose::STANDARD.encode(bytes));
    Ok(attachment)
}

#[tauri::command]
pub fn store_attachment(name: String, data: String) -> Result<Attachment, String> {
    if data.len() as u64 > (MAX_BYTES * 4 / 3 + 4) {
        return Err("附件不能超过 20 MB".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("附件不能超过 20 MB".into());
    }
    let directory = std::env::temp_dir().join("piazza-attachments");
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let filename = Path::new(&name)
        .file_name()
        .filter(|s| !s.is_empty())
        .ok_or("无效文件名")?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let path = directory.join(format!("{stamp}-{}", filename.to_string_lossy()));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    let mut attachment = read_attachment(path.to_string_lossy().into_owned())?;
    attachment.name = filename.to_string_lossy().into_owned();
    Ok(attachment)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recognizes_image_bytes_without_trusting_extension() {
        assert_eq!(image_mime(b"\x89PNG\r\n\x1a\nrest"), Some("image/png"));
        assert_eq!(image_mime(b"RIFF1234WEBPrest"), Some("image/webp"));
        assert_eq!(image_mime(b"plain text"), None);
    }
    #[test]
    fn attachment_round_trip_uses_safe_filename() {
        let data = base64::engine::general_purpose::STANDARD.encode(b"hello");
        let attachment = store_attachment("../../note.txt".into(), data).unwrap();
        assert!(Path::new(&attachment.path).starts_with(
            std::fs::canonicalize(std::env::temp_dir().join("piazza-attachments")).unwrap()
        ));
        assert_eq!(std::fs::read_to_string(&attachment.path).unwrap(), "hello");
        std::fs::remove_file(attachment.path).unwrap();
    }
    #[test]
    fn image_payload_round_trips_without_changing_bytes() {
        let data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ioAAAAASUVORK5CYII=";
        let attachment = store_attachment("clipboard.png".into(), data.into()).unwrap();
        assert_eq!(attachment.mime_type, Some("image/png"));
        assert_eq!(attachment.name, "clipboard.png");
        assert_eq!(attachment.data.as_deref(), Some(data));
        std::fs::remove_file(attachment.path).unwrap();
    }
}
