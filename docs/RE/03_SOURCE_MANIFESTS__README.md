# Source manifests — how to read these files

## Authoritative derived files

- `SOURCE_ARCHIVE_SHA256.txt` — hashes of the user-provided source containers.
- `hotline_miami_archive_listing.*` — Windows RAR file list only.
- `gog_linux_archive_listing.*` — GOG Linux RAR file list only.
- `hm_payload_zip_listing.*` — GOG payload container file list.
- `linux_elf_header.txt` / `linux_elf_file_type.txt` — static ELF metadata.
- `linux_gameplay_script_names.txt` — exactly 375 unique `gml::scr*` names extracted from `nm -C`.
- `linux_object_names.txt` — 803 unique parsed `obj*` names.
- `linux_object_event_functions.txt` — 2,131 unique compiled object-event functions.
- `linux_room_names.txt` / `linux_room_create_symbols.txt` — 80 explicit `Rooms_*_rm*__Create` symbols.
- `linux_wad_index.*` — exact parsed index of the Linux GOG GL WAD: 633 entries.
- `linux_wad_index_summary.*` — exact Linux WAD counts.

## Secondary / noisy diagnostic

`wad_observed_resource_paths.txt` was produced by `strings` over the whole WAD and therefore includes path-like strings inside payload resources. It is useful for keyword search but **must not be used for resource counts**. Use `linux_wad_index.*` for counts.

## Original game files

Original Hotline Miami executable/WAD/audio assets are not included in this handoff.
