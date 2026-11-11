// Windows system-default browser, with a fixed allowlist and no shell interpolation.
// Uses the built-in ShellExecuteW API: no new Cargo dependency or network download.
#[cfg(target_os = "windows")]
#[link(name = "shell32")]
unsafe extern "system" {
    fn ShellExecuteW(
        hwnd: *mut std::ffi::c_void,
        operation: *const u16,
        file: *const u16,
        parameters: *const u16,
        directory: *const u16,
        show_command: i32,
    ) -> isize;
}

#[tauri::command]
fn open_apps_games_url(kind: String) -> Result<(), String> {
    let url = match kind.as_str() {
        "donate" => "https://appsandgames.org/#info",
        "portal" => "https://appsandgames.org/",
        _ => return Err("Unsupported external link".into()),
    };

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide = |s: &str| -> Vec<u16> {
            std::ffi::OsStr::new(s).encode_wide().chain(Some(0)).collect()
        };
        let verb = wide("open");
        let target = wide(url);
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(), verb.as_ptr(), target.as_ptr(),
                std::ptr::null(), std::ptr::null(), 1,
            )
        };
        if result > 32 { Ok(()) } else { Err(format!("Windows ShellExecuteW error: {result}")) }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = url;
        Err("This command is intended for the Windows edition".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![open_apps_games_url])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
