```make
UUID=per-app-volume@utsu

pack:
	gnome-extensions pack --force --out-dir dist --extra-source=icons

install: pack
	gnome-extensions install -f dist/*.zip
