# StatePass — Stateless Password Generator (Chrome Extension)

Deterministic password generator: same inputs always produce the same password. No passwords are ever stored.

## Features
- **Stateless**: PBKDF2-SHA256 derivation from site + login + master password
- **Sync**: Push/pull/merge profiles via self-hosted sync server
- **Auto-fill**: HTML autofill standard detection + manual field mapping
- **Themes**: Dark/light toggle
- **Clipboard**: Auto-clears after 30 seconds
- **Security**: 600K PBKDF2 iterations, length-prefixed salt, SHA-256 only

## Development
No build step required — Chrome loads `src/` directly as unpacked extension.

## Version History
- v1.0: Original LessPass+ (SHA-1 allowed, simple salt)
- v2.0: Hardened (length-prefixed salt, 600K iters, no SHA-1)
- v3.0: StatePass — SHA-256 only, sync integration, auto-fill, light/dark theme, manual mapping
