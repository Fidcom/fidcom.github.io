# Fidcom GitHub Pages

Sitio publicado con GitHub Pages para la PWA **Estimador de Rieles Solares**.

## URL esperada

Cuando GitHub Pages esté activo, la app debe abrir en:

```text
https://fidcom.github.io/
```

## Archivos principales

- `index.html`: pantalla principal de la app.
- `styles.css`: estilos responsive para PC y Android.
- `app.js`: cálculos de rieles, cortes, splices, patas y persistencia local.
- `manifest.webmanifest`: configuración PWA para instalar en Android.
- `service-worker.js`: cache offline básico.
- `icon.svg`: icono de la app.

## Publicar cambios

```bash
git add .
git commit -m "Add solar rail estimator PWA"
git push origin main
```

En GitHub, revisa **Settings → Pages** y confirma que el source sea `Deploy from a branch`, rama `main`, carpeta `/root`.