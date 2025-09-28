# Per-App Volume Mixer (GNOME)
- Sliders par application (PipeWire/Pulse via `pactl`)
- Icônes d’app (PNG perso > .desktop > thème)
- Bouton X (kill + masque la ligne)
- Auto-refresh (`pactl subscribe`)
- Compact UI

## Dépendances
- `pactl` (paquet `pulseaudio-utils` sur Debian/Ubuntu). PipeWire fournit `pipewire-pulse`.

## Installation locale
```bash
gnome-extensions pack --force --out-dir dist --extra-source=icons
gnome-extensions install -f dist/*.zip
```
