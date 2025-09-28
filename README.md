
---

# Per-App Volume Mixer (GNOME)

Contrôlez le **volume par application** directement depuis la barre GNOME.
Interface compacte, **icônes d’app**, **auto-refresh**, et bouton **✕** pour couper un flux.

## Fonctionnalités

* 🎚️ **Slider par application** (PipeWire/Pulse via `pactl`)
* 🖼️ **Icônes fiables** : PNG perso ➝ icône système (.desktop) ➝ thème
* ✕ **Fermer un flux** (kill du sink-input) + masquer la ligne
* 🔄 **Auto-refresh** (écoute `pactl subscribe`)
* 🧠 **Souvenirs de volume par app** (au sein de la session : un nouvel ID flux récupère ton réglage)
* 🧩 UI compacte, espacée, propre

> ℹ️ Limite OS : c’est **par application**, pas par **onglet de navigateur**. Pour du par-onglet, utilisez une extension navigateur.

## Prérequis

* GNOME **43–47**
* `pactl`
  Debian/Ubuntu : `sudo apt install pulseaudio-utils`
  (avec PipeWire, le paquet `pipewire-pulse` fournit la compatibilité Pulse)

## Installation (depuis la source)

```bash
# cloner
git clone https://github.com/Utsukushii42/per-app-volume-gnome.git
cd per-app-volume-gnome

# packer et installer localement
gnome-extensions pack --force --out-dir dist --extra-source=icons
gnome-extensions install -f dist/*.zip

# activer
gnome-extensions enable per-app-volume@utsu

# redémarrer le Shell si besoin :
#  - Xorg : Alt+F2, taper r, Entrée
#  - Wayland : se déconnecter / reconnecter
```

## Utilisation

* Ouvrez le menu de la barre → icône **volume** de l’extension.
* Ajustez le slider de chaque application.
* Cliquez **✕** pour **tuer le flux** et **masquer la ligne** (bouton “Tout afficher” pour tout ré-afficher).
* Le volume choisi est **retenu pour l’appli** (si elle recrée un flux, l’extension réapplique votre valeur).

## Icônes personnalisées (optionnel)

Placez vos PNG dans `icons/` à la racine de l’extension.
L’extension cherche dans cet ordre :

1. `icons/<nom>.png` (perso)
2. Icône système (.desktop via `Gio.AppInfo`)
3. Icône de thème par nom

**Astuce :** nommer le fichier d’icône comme l’**ID .desktop** (sans `.desktop`) ou comme le **binaire**.
Exemples : `icons/firefox.png`, `icons/spotify.png`, `icons/discord.png`.

## Build rapide (Makefile)

```bash
make install   # pack + install
```

## Dépannage

* **Pas de sliders / erreur pactl**
  → `sudo apt install pulseaudio-utils`
  → Vérifiez `journalctl --user -f | grep -i gnome-shell` et Looking Glass (`Alt+F2` → `lg` → onglet *Errors*).

* **Icône manquante**
  → Ajoutez un PNG dans `icons/` avec le bon nom (ID `.desktop` sans suffixe, ou nom du binaire).
  → Rouvrez le menu ou relancez le Shell.

* **Rien ne se met à jour**
  → L’extension écoute `pactl subscribe`. Si `pactl` n’est pas dispo, installez-le.
  → Sinon cliquez “Rafraîchir”.

## Compatibilité & sécurité

* Testé GNOME **43–47**.
* Pas d’accès réseau.
* Utilise `Gio.Subprocess` pour invoquer `pactl`.
  *Note EGO :* si la review demande d’éviter les subprocess, une variante basée sur **Gvc** (API GNOME audio) est prévue.

## Roadmap

* Option **mute/unmute** au lieu du kill
* Persistance des volumes **entre redémarrages** (petit `state.json` user-data)
* Tuile **Quick Settings** (GNOME 45+)

## Licence

[MIT](./LICENSE)

---
