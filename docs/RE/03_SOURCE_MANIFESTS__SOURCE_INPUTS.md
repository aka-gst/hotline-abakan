# Original source inputs used during static research

Original files are **not bundled** in this handoff. Reattach them separately if another chat must inspect binary/resource payloads again.

| File | Role | SHA-256 |
|---|---|---|
| `hotline_miami.rar` | Full Windows build supplied by user | `f41ff89c01bc920c35a3111a9ff07b4b7e65ba421643551701d377c291a8fcc9` |
| `Hotline Miami [GOG] [Linux].rar` | GOG Linux build supplied by user | `18c4bb69b27f4a6c041f0a3f33acfa80541ea9191689b09d0a701302ee1e0da2` |
| `hm_payload.zip` | Intermediate payload extracted from GOG installer as a container | `b557f70825f6cf50e85748f0de83128e086f3f646fa247e73f1660967c6dd1c6` |

The Windows archive listing shows both `HotlineMiami_Original.exe` and the GL branch (`HotlineGL.exe` + `HotlineMiami_GL.wad`). The Linux payload supplied the non-stripped ELF used for symbol-name analysis.
