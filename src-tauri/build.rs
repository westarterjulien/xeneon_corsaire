fn main() {
    // Numéro de build GitHub Actions, utilisé par la mise à jour automatique (updater.rs).
    println!("cargo:rerun-if-env-changed=GITHUB_RUN_NUMBER");
    tauri_build::build()
}
