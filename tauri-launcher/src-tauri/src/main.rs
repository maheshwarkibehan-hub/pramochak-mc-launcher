// ============================================================================
//  PRAMOCHAK MINECRAFT STUDIO LAUNCHER (TAURI V2 RUST ENTRYPOINT)
//  Author:    Maheshwar Hari Tripathi
//  Copyright: Copyright (c) 2026 Maheshwar Hari Tripathi. All rights reserved.
//  License:   MIT License
//  Website:   https://github.com/maheshwarkibehan-hub/pramochak-mc-launcher
//  Watermark: PRAMOCHAK-RUST-BIN-SECURE-ID: MHT-MC-RUST-2026
// ============================================================================

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri_launcher_lib::run()
}
