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
## Planificador de misiones Mini 4 Pro

`mini4pro/` es el planificador web de misiones Map y Orbit para el DJI Mini 4 Pro, el compañero de PC de la
app Mini4Pro. Se abre en `https://fidcom.github.io/mini4pro/`. Las misiones se sincronizan con la rama
`misiones` del repositorio privado `Fidcom/mini4pro-app` usando un token que queda solo en el navegador.

`mini4pro/ppk.html` junta el registro de fotos de la app (Registros de vuelo > Compartir > Fotos para PPK) con el
archivo `.pos` de un receptor GNSS (RTKLIB o Emlid Studio) y da la posición corregida de cada foto en CSV (Pix4D,
Metashape) o `geo.txt` (WebODM). Todo se calcula en el navegador.

Pruebas: `node --test mini4pro/test/planner.test.mjs mini4pro/test/sync.test.mjs mini4pro/test/ppk.test.mjs`
