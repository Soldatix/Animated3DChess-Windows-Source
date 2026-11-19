// P3-B3: Windows Credential Manager, per-user Generic Credential.
// No third-party crates, filesystem copies, telemetry or token logging.
#[cfg(target_os = "windows")]
mod win {
    use std::{ffi::c_void, io, ptr};

    const CRED_TYPE_GENERIC: u32 = 1;
    const CRED_PERSIST_LOCAL_MACHINE: u32 = 2; // user-scoped; does NOT use roaming enterprise persistence
    const ERROR_NOT_FOUND: i32 = 1168;
    const MAX_BLOB: usize = 1024;

    #[repr(C)]
    #[allow(non_snake_case)]
    struct CredentialW {
        Flags: u32,
        Type: u32,
        TargetName: *mut u16,
        Comment: *mut u16,
        LastWritten: [u32; 2],
        CredentialBlobSize: u32,
        CredentialBlob: *mut u8,
        Persist: u32,
        AttributeCount: u32,
        Attributes: *mut c_void,
        TargetAlias: *mut u16,
        UserName: *mut u16,
    }

    #[link(name = "advapi32")]
    unsafe extern "system" {
        fn CredWriteW(credential: *const CredentialW, flags: u32) -> i32;
        fn CredReadW(target: *const u16, typ: u32, flags: u32,
                     credential: *mut *mut CredentialW) -> i32;
        fn CredDeleteW(target: *const u16, typ: u32, flags: u32) -> i32;
        fn CredFree(buffer: *mut c_void);
    }
    fn target(base_url: &str) -> Result<Vec<u16>, String> {
        // Canonical origin only; reject credential-over-URL and accidental secrets.
        let remote = base_url.strip_prefix("https://");
        let local = base_url.strip_prefix("http://")
            .filter(|host| *host == "127.0.0.1:8787" || *host == "localhost:8787");
        let host = remote.or(local).ok_or("invalid-server-url")?;
        if host.is_empty() || host.len() > 220 || host.bytes().any(|b| {
            !(b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b':')
        }) || host.starts_with('.') || host.starts_with(':') || host.contains("..") {
            return Err("invalid-server-url".into());
        }
        let id = format!("AppsAndGames.Animated3DChess.Multiplayer.v1:{}", base_url);
        Ok(id.encode_utf16().chain(std::iter::once(0)).collect())
    }
    pub fn load(base_url: &str) -> Result<Option<String>, String> {
        let name = target(base_url)?;
        let mut ptr: *mut CredentialW = ptr::null_mut();
        let result = unsafe { CredReadW(name.as_ptr(), CRED_TYPE_GENERIC, 0, &mut ptr) };
        if result == 0 {
            if io::Error::last_os_error().raw_os_error() == Some(ERROR_NOT_FOUND) { return Ok(None); }
            return Err("windows-vault-read-failed".into());
        }
        if ptr.is_null() { return Err("windows-vault-read-failed".into()); }
        let bytes = unsafe {
            let value = &*ptr;
            if value.CredentialBlobSize as usize > MAX_BLOB ||
               (value.CredentialBlobSize != 0 && value.CredentialBlob.is_null()) {
                CredFree(ptr.cast());
                return Err("windows-vault-corrupt".into());
            }
            let content = if value.CredentialBlobSize == 0 { Vec::new() } else {
                std::slice::from_raw_parts(value.CredentialBlob,
                    value.CredentialBlobSize as usize).to_vec()
            };
            CredFree(ptr.cast());
            content
        };
        String::from_utf8(bytes).map(Some).map_err(|_| "windows-vault-corrupt".into())
    }
    pub fn save(base_url: &str, record: &str) -> Result<(), String> {
        let mut name = target(base_url)?;
        let mut bytes = record.as_bytes().to_vec();
        if bytes.is_empty() || bytes.len() > MAX_BLOB { return Err("invalid-vault-record".into()); }
        // Validate schema to avoid an arbitrary-data storage endpoint.
        let v: serde_json::Value = serde_json::from_str(record)
            .map_err(|_| "invalid-vault-record")?;
        let code = v.get("code").and_then(|x| x.as_str()).unwrap_or("");
        let token = v.get("token").and_then(|x| x.as_str()).unwrap_or("");
        if v.get("v").and_then(|x| x.as_i64()) != Some(1)
            || v.get("baseUrl").and_then(|x| x.as_str()) != Some(base_url)
            || !matches!(v.get("side").and_then(|x| x.as_str()), Some("w") | Some("b"))
            || code.len() != 10 || !code.bytes().all(|x| b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789".contains(&x))
            || token.len() < 40 || token.len() > 80
            || !token.bytes().all(|x| x.is_ascii_alphanumeric() || x == b'_' || x == b'-') {
            return Err("invalid-vault-record".into());
        }
        let credential = CredentialW {
            Flags:0, Type:CRED_TYPE_GENERIC, TargetName:name.as_mut_ptr(),
            Comment:ptr::null_mut(), LastWritten:[0,0],
            CredentialBlobSize:bytes.len() as u32,
            CredentialBlob:bytes.as_mut_ptr(), Persist:CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount:0, Attributes:ptr::null_mut(),
            TargetAlias:ptr::null_mut(), UserName:ptr::null_mut(),
        };
        if unsafe { CredWriteW(&credential, 0) } == 0 {
            return Err("windows-vault-save-failed".into());
        }
        Ok(())
    }
    pub fn clear(base_url: &str) -> Result<(), String> {
        let name = target(base_url)?;
        if unsafe { CredDeleteW(name.as_ptr(), CRED_TYPE_GENERIC, 0) } == 0 &&
           io::Error::last_os_error().raw_os_error() != Some(ERROR_NOT_FOUND) {
            return Err("windows-vault-clear-failed".into());
        }
        Ok(())
    }
}

#[tauri::command]
pub fn online_vault_load(base_url: String) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    { win::load(&base_url) }
    #[cfg(not(target_os = "windows"))]
    { let _ = base_url; Err("windows-vault-only".into()) }
}

#[tauri::command]
pub fn online_vault_save(base_url: String, record: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    { win::save(&base_url, &record) }
    #[cfg(not(target_os = "windows"))]
    { let _ = (base_url, record); Err("windows-vault-only".into()) }
}

#[tauri::command]
pub fn online_vault_clear(base_url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    { win::clear(&base_url) }
    #[cfg(not(target_os = "windows"))]
    { let _ = base_url; Err("windows-vault-only".into()) }
}
