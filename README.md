# ATOMTEX Spectrum Analyzer Web

Aplicación web estática, en español, para abrir espectros gamma ATOMTEX, explorar regiones de interés y exportar a Excel. Funciona completamente en el navegador: no envía mediciones a un servidor, no usa analítica ni dependencias desde CDN. El código Python/Windows proporcionado como referencia no se modifica ni se necesita para ejecutar la web.

## Funciones

- Selector local y arrastrar/soltar un archivo `.ats` (hasta 8 MiB y 65.536 canales).
- Lectura de `SPECTR`, `ECALIBRATION`, `EFFCALIBRATION`, `RCALIBRATION` y metadatos. No se rellenan bloques ausentes ni se interpolan energías.
- Gráfico de cuentas contra canal o energía, cursor, zoom con rueda/botones y desplazamiento al arrastrar; escala lineal/logarítmica. Los ceros se omiten del gráfico logarítmico, conservándose en datos y exportaciones.
- ROI por canales inclusivos: entradas numéricas o dos clics en el gráfico. Las ROI se mantienen por canal aunque cambies el eje a energía.
- Línea base manual: alturas izquierda/derecha editables o dos clics para fijarlas sobre el gráfico. Los clics fijan primero la altura izquierda y luego la derecha, en los límites de la ROI actual; su coordenada horizontal no cambia los límites.
- Bases lineal y constante estimadas por promedio de ventanas de extremos. Las ventanas no pueden solaparse.
- Áreas bruta, bajo base y neta, con sombreado de la ROI. Al editar parámetros se invalida el resultado anterior; **Calcular áreas** aplica los cambios. **Limpiar ROI** elimina el análisis sin tocar los datos.
- CSV para Excel en español y XLSX con hojas **Espectro**, **Metadatos**, gráfico de dispersión editable y trazabilidad del análisis.
- Tabla accesible de los primeros 100 canales; las exportaciones incluyen todos.

## Ejecutar y desarrollar

Requiere Node.js **22.12+** (recomendado 24) y npm. Probado en Chromium; en Windows 10 usá una versión vigente de Chrome o Edge. No se requiere Python para la aplicación.

```sh
npm ci
npm run dev
```

Abrí la dirección que informa Vite bajo la ruta `/ATOMTEX-Analyzer/`. Para compilar y probar el artefacto estático:

```sh
npm run build
npm run preview
```

Se genera `dist/`; puede servirse en cualquier hosting estático bajo `/ATOMTEX-Analyzer/`. No abras `index.html` con `file://`: los módulos requieren un servidor HTTP. La aplicación no incorpora backend ni subida de archivos. Dependencias y tipografías se sirven desde el mismo sitio. Una vez cargada la página, la lectura, el análisis y las descargas no necesitan solicitudes de red.

### Estructura para modificar la aplicación

- `src/parser.js`: decodificación y validación del ATS, sin dependencias de UI.
- `src/analysis.js`: cálculo puro de ROI y base, sin mutación del espectro.
- `src/export.js`: CSV y paquete OOXML/XLSX, con strings de metadatos escapadas y literales, nunca fórmulas.
- `src/main.js`: carga local, gráfico e interacción; `index.html` y `src/style.css`: interfaz adaptable.
- `tests/fixtures/synthetic.ats`: datos artificiales para CI. Las mediciones reales permanecen fuera del repositorio; `tests/private-sample.real.js` permite validarlas localmente.

## Formato ATS validado

La lectura se contrastó con **`ejemplo_123.ats`** y con el lector de `atomtex_analyzer.py` suministrados por el usuario. La muestra se conservó en un directorio privado fuera del checkout; no se publica ni se incorpora al build. Cada bloque declara su longitud y tiene exactamente un número por línea:

```text
ATOMTEXSPECTRUM =
TIME = 60
ECALIBRATION = 3
0.000000
10.000000
20.000000
SPECTR = 3
10.000000
20.000000
30.000000
```

Este fragmento es ilustrativo, no una captura de instrumento. `ECALIBRATION` es una **tabla de energía por canal**, no coeficientes polinómicos. En la muestra real hay canales iniciales con energía cero; se preservan esas repeticiones. Se admiten energías no negativas y no decrecientes. Los valores de eficiencia y resolución se conservan como campos ATS, sin inferir sus unidades ni utilizarlos para actividad.

Se admiten UTF-8 con/sin BOM y UTF-16 con BOM, separador decimal punto/coma y notación científica. Se rechazan bloques duplicados, longitudes incoherentes, datos truncados, valores no finitos, números fuera de rango seguro, cuentas negativas, energías decrecientes y líneas no interpretables. Las cuentas decimales se conservan sin redondearlas. Archivos binarios, otras codificaciones o variantes no observadas requieren ampliar el lector con otra muestra real; no se intenta adivinar su estructura.

Si falta energía o toda la tabla es cero, solo se ofrece el eje canal. Una tabla ausente se exporta vacía; una tabla de ceros existente se conserva. La lectura correcta no certifica la calibración física del instrumento.

## Áreas y línea base

Los canales usan índices desde **0**. Para una ROI `[a,b]`, ambos inclusive:

- Área bruta = suma de las cuentas originales entre `a` y `b`.
- Base manual/lineal: `base(i) = izquierda + (derecha − izquierda) × (i − a) / (b − a)`.
- Base constante: promedio de las dos medias de extremos.
- Área de base = suma discreta de `base(i)`; área neta = bruta − base.

Las áreas están en **cuentas**, no en cuentas·keV ni Bq. No se recortan los resultados negativos. El trazado por energía no cambia la integración por canal ni inventa espaciados entre energías repetidas. Las medias de extremos se estiman sobre los datos originales. No se modifica el archivo ni se sustituyen sus cuentas.

El análisis es exploratorio: no incorpora identificación de radionúclidos, actividad absoluta, incertidumbres certificadas, ajuste gaussiano, resta de un segundo espectro, línea base automática multipico ni informe PDF. Estas funciones de evolución requieren validación adicional; esta entrega prioriza la lectura real, Excel y ROI/base manual. No pretende paridad completa con todas las funciones de la referencia de escritorio.

## Exportaciones

**CSV:** UTF-8 con BOM, CRLF, separador `;`, coma decimal. Columnas: Canal, Energía (keV), Cuentas, Eficiencia (ATS), Resolución (ATS), Línea base ROI (cuentas). La base queda vacía fuera de la ROI. Para otras configuraciones regionales de Excel, usá **Datos → Desde texto/CSV**, UTF-8 y delimitador punto y coma. El CSV contiene datos numéricos; los metadatos y las áreas resumidas se guardan en XLSX.

**Excel (.xlsx):** datos numéricos originales y línea base en **Espectro**; metadatos y, si hay análisis aplicado, límites, método, ventana, alturas y áreas en **Metadatos**. El gráfico editable refleja el espectro original completo, con energía si está disponible o canal si falta. No depende del zoom o escala actuales. Las energías repetidas siguen siendo puntos distintos. Si hay una ROI aplicada, el gráfico incluye también su línea base como una segunda serie editable. No se exportan macros, vínculos externos ni fórmulas a partir de texto del archivo.

## Pruebas

```sh
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

En un entorno con Chromium del sistema:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

La validación privada con un ATS real es independiente y requiere una ruta explícita:

```sh
ATS_SAMPLE_PATH=/ruta/privada/ejemplo_123.ats npm run test:real
```

No copies mediciones al repositorio ni las subas a CI. En esta sesión se verificó la muestra aportada por el usuario, incluyendo todos los valores de los cuatro bloques y su exportación a Excel. El test privado compara el archivo completo con el modelo y las celdas exportadas; no guarda el contenido ni sus resultados como fixtures.

Pruebas unitarias públicas con datos sintéticos: calibraciones, metadatos, archivos malformados, BOM, codificaciones, límites, valores ausentes, áreas inclusivas, conservación de datos y resultados negativos. Exportaciones: contenido CSV, estructura XLSX, datos, enlaces del gráfico y texto hostil literal. Pruebas de navegador sobre el build: carga de archivos sintéticos, arrastrar/soltar, zoom/escala, ROI/base, descargas, errores, datos sin energía, vista móvil y ausencia de solicitudes externas al procesar. El XLSX también se leyó con openpyxl como validación independiente; la apariencia en Excel de escritorio aún requiere revisión manual.

## Desplegar en GitHub Pages

El workflow de CI ejecuta pruebas, build y navegador en pull requests. El workflow **Deploy GitHub Pages** está preparado para ejecución manual, solo desde `main`; no habilita ni modifica la configuración de Pages.

1. Revisar y fusionar el pull request.
2. En **Settings → Pages → Build and deployment**, seleccionar **GitHub Actions**.
3. En **Actions → Deploy GitHub Pages**, ejecutar **Run workflow** sobre `main`.
4. Revisar el despliegue y abrir el sitio en la ruta `/ATOMTEX-Analyzer/`.

`vite.config.js` fija esa ruta base para los assets. No se ha activado Pages ni publicado automáticamente el sitio.

## Referencia

Implementación de [issue #1](https://github.com/asielhm/ATOMTEX-Analyzer/issues/1), ampliada con ROI y línea base manual a pedido del usuario. El ejecutable Windows no está en este repositorio; la versión web es independiente.
