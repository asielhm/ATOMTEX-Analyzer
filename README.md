# ATS Spectrum Analizer

Aplicación web estática, en español, para abrir espectros gamma ATS, explorar regiones de interés y exportar a Excel. Funciona completamente en el navegador: no envía mediciones a un servidor, no usa analítica ni dependencias desde CDN. El código Python/Windows proporcionado como referencia no se modifica ni se necesita para ejecutar la web.

## Funciones

- Selector local y arrastrar/soltar un archivo `.ats` (hasta 8 MiB y 65.536 canales).
- Lectura de `SPECTR`, `ECALIBRATION`, `EFFCALIBRATION`, `RCALIBRATION` y metadatos. No se rellenan bloques ausentes ni se interpolan energías.
- Gráfico de cuentas contra canal o energía, cursor, zoom con rueda/botones y desplazamiento al arrastrar; escala lineal/logarítmica. Los ceros se omiten del gráfico logarítmico, conservándose en datos y exportaciones.
- ROI por canales inclusivos: entradas numéricas o botón **Poner límites con clics** junto al gráfico; marcá inicio y fin con dos clics. Las líneas **I/F** se pueden arrastrar con mouse o dedo para ajustar la región y recalcular las áreas inmediatamente. También se ajustan con Tab y flechas (Shift mueve 10 canales; Inicio/Fin llevan al extremo permitido). Los límites no se cruzan y respetan la ventana de extremos de la línea base elegida. Las ROI se mantienen por canal aunque cambies el eje a energía.
- Línea base manual: alturas izquierda/derecha editables o dos clics para fijarlas sobre el gráfico. Los clics fijan primero la altura izquierda y luego la derecha, en los límites de la ROI actual; su coordenada horizontal no cambia los límites.
- Bases lineal y constante estimadas por promedio de ventanas de extremos. Las ventanas no pueden solaparse.
- Áreas bruta, bajo base y neta, con sombreado de la ROI. Al editar parámetros se invalida el resultado anterior; **Calcular áreas** aplica los cambios. **Limpiar ROI** elimina el análisis sin tocar los datos.
- Búsqueda automática de picos al cargar y al cambiar parámetros, con candidatos de radionúclidos por energía. Catálogo local y trazable: 161 líneas gamma de 27 radionúclidos. Se conservan las coincidencias ambiguas; no se presenta una identificación como confirmada.
- Selección automática opcional de la ROI del pico principal, marcadores en el gráfico y botón **Analizar pico** para cada resultado. Se mantienen las bases manual, lineal y constante.
- Nueva marca **ATS Spectrum Analizer**, logo propio y favicon local.
- CSV para Excel en español y XLSX con hojas **Espectro**, **Metadatos** y **Picos**, gráfico de dispersión editable y trazabilidad del análisis.
- Tabla accesible de los primeros 100 canales; las exportaciones incluyen todos.

## Ejecutar y desarrollar

Requiere Node.js **22.12+** (recomendado 24) y npm. Probado en Chromium; en Windows 10 usá una versión vigente de Chrome o Edge. No se requiere Python para la aplicación.

```sh
npm ci
npm run dev
```

Abrí la dirección que informa Vite bajo la ruta `/ats-spectrum-analizer/`. Para compilar y probar el artefacto estático:

```sh
npm run build
npm run preview
```

Se genera `dist/`; puede servirse en cualquier hosting estático bajo `/ats-spectrum-analizer/`. No abras `index.html` con `file://`: los módulos requieren un servidor HTTP. La aplicación no incorpora backend ni subida de archivos. Dependencias y tipografías se sirven desde el mismo sitio. Una vez cargada la página, la lectura, el análisis y las descargas no necesitan solicitudes de red.

### Estructura para modificar la aplicación

- `src/parser.js`: decodificación y validación del ATS, sin dependencias de UI.
- `src/analysis.js`: cálculo puro de ROI y base, sin mutación del espectro.
- `src/roi-controls.js`: marcadores de límites, arrastre con mouse/touch y ajuste accesible por teclado.
- `src/export.js`: CSV y paquete OOXML/XLSX, con strings de metadatos escapadas y literales, nunca fórmulas.
- `src/identification.js` y `src/identification-ui.js`: búsqueda de picos, coincidencias energéticas, presentación y acciones de ROI.
- `src/data/gamma-lines.json`: catálogo gamma local; `tools/build_gamma_catalog.py`: extracción reproducible de la fuente pública fijada.
- `src/main.js`: carga local, gráfico e interacción; `index.html` y `src/style.css`: interfaz adaptable.
- `tests/fixtures/synthetic.ats`: datos artificiales para CI. Las mediciones reales permanecen fuera del repositorio; `tests/private-sample.real.js` permite validarlas localmente.

## Formato ATS validado

La lectura se contrastó con una muestra real y con el lector de escritorio suministrado por el usuario. La muestra se conservó en un directorio privado fuera del checkout; no se publica ni se incorpora al build. Cada bloque declara su longitud y tiene exactamente un número por línea:

```text
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

El análisis es exploratorio: sugiere candidatos de radionúclidos por energía, pero no confirma identidades ni calcula actividad absoluta, incertidumbres certificadas, ajuste gaussiano, resta de un segundo espectro, línea base automática multipico ni informe PDF. Estas funciones de evolución requieren validación adicional; esta entrega prioriza la lectura real, Excel y ROI/base manual. No pretende paridad completa con todas las funciones de la referencia de escritorio.

## Picos y candidatos automáticos

Al cargar un ATS con calibración energética utilizable se buscan hasta 50 picos. El algoritmo usa una copia suavizada con pesos triangulares de cinco canales `[1,2,3,2,1]/9`. Para cada máximo local se buscan mínimos a izquierda y derecha dentro de una semiventana configurable (16 canales por defecto). Se exige una prominencia respecto al mayor de ambos mínimos de al menos `max(5, umbral × sqrt(base + 1))`, con umbral 4 por defecto. Es un criterio heurístico, no una significancia estadística certificada.

La energía observada es el centroide ponderado sobre la región de semialtura de la señal suavizada, descontando ese fondo local. Se evita contar máximos cercanos de un mismo pico como picos independientes. No se alteran las cuentas, no se realizan ajustes gaussianos ni se utiliza `RCALIBRATION` como resolución: sus unidades no están verificadas. Picos débiles, de borde, solapados o muy anchos pueden no resolverse; los máximos del continuo también pueden generar candidatos.

Cada pico se compara con líneas del catálogo usando `max(tolerancia absoluta, energía de referencia × tolerancia relativa / 100)`: por defecto **5 keV** y **2 %**. La tabla muestra energía observada, referencia, diferencia, tolerancia y número de líneas distintas compatibles. Las coincidencias se ordenan por proximidad relativa; ese orden no es una probabilidad ni una confirmación. Un pico no corrobora por sí mismo varias líneas de un mismo radionúclido. Se retienen las coincidencias ambiguas, como U-235/Ra-226 alrededor de 186 keV. Una señal de 511 keV se advierte como posible aniquilación, sin atribuirla automáticamente a Na-22; las líneas gamma reales próximas también se muestran.

El catálogo es **parcial**: no encontrar una coincidencia o un pico no demuestra ausencia. La resolución del detector NaI, la calibración, el fondo, rayos X, picos de escape/suma, mezclas y cadenas de decaimiento limitan la interpretación. No se infiere equilibrio con un padre a partir de una línea de su hija. Cs-137 se indica con el emisor Ba-137m, sin sustituir silenciosamente el emisor físico. La calibración del archivo no se valida por reconocer un pico.

La casilla **Analizar automáticamente el pico principal al cargar** está activada por defecto; se puede desactivar antes de cargar el siguiente archivo. Ajustar parámetros de detección reanaliza candidatos, conservando la ROI que estabas editando. **Analizar pico** crea una ROI sugerida alrededor de ese pico respetando la ventana y el tipo de base seleccionados. Esa ROI se puede modificar con los controles I/F como cualquier otra.

### Fuente y reproducción del catálogo

Subconjunto de `sandia.decay.xml` de [SandiaDecay / ENSDF](https://github.com/sandialabs/SandiaDecay), revisión fija `cd75314b56e12b80497531a1fbeed9c8e9968403`. Se consideraron 28 radionúclidos comunes y se conservaron los 27 con líneas gamma entre 20 y 3500 keV y probabilidad de emisión por decaimiento padre ≥0,005. Las probabilidades nucleares no se presentan como probabilidades de identificación. Para Cs-137 se incorpora la rama a Ba-137m. No se incorporan rayos X ni el resto de cadenas automáticamente. El archivo de origen se verifica mediante SHA-256 antes de generar el subconjunto.

```sh
python tools/build_gamma_catalog.py /ruta/al/sandia.decay.xml
```

La fuente completa no se descarga al usar la web ni durante la instalación; el pequeño subconjunto está incluido en el bundle. El generador solo lee la fuente nuclear pública, nunca mediciones. La atribución y licencia LGPL 2.1 del subconjunto están en `public/licenses/`; el propio proveedor advierte que los datos pueden contener errores y no son definitivos.

## Exportaciones

**CSV:** UTF-8 con BOM, CRLF, separador `;`, coma decimal. Columnas: Canal, Energía (keV), Cuentas, Eficiencia (ATS), Resolución (ATS), Línea base ROI (cuentas). La base queda vacía fuera de la ROI. Para otras configuraciones regionales de Excel, usá **Datos → Desde texto/CSV**, UTF-8 y delimitador punto y coma. El CSV contiene datos numéricos; los metadatos y las áreas resumidas se guardan en XLSX.

**Excel (.xlsx):** datos numéricos originales y línea base en **Espectro**; metadatos y, si hay análisis aplicado, límites, método, ventana, alturas y áreas en **Metadatos**. El gráfico editable refleja el espectro original completo, con energía si está disponible o canal si falta. No depende del zoom o escala actuales. Las energías repetidas siguen siendo puntos distintos. Si hay una ROI aplicada, el gráfico incluye también su línea base como una segunda serie editable. La hoja **Picos** incluye cada candidato con su energía observada/de referencia, diferencia, tolerancia, corroboración orientativa, emisor y ROI sugerida. **Metadatos** guarda la versión/fuente del catálogo y los parámetros de detección usados; no confunde candidatos con identidades confirmadas. No se exportan macros, vínculos externos ni fórmulas a partir de texto del archivo.

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
ATS_SAMPLE_PATH=/ruta/privada/espectro.ats npm run test:real
```

No copies mediciones al repositorio ni las subas a CI. En esta sesión se verificó la muestra aportada por el usuario, incluyendo todos los valores de los cuatro bloques y su exportación a Excel. El test privado compara el archivo completo con el modelo y las celdas exportadas; no guarda el contenido ni sus resultados como fixtures.

Pruebas unitarias públicas con datos sintéticos: calibraciones, metadatos, archivos malformados, BOM, codificaciones, límites, valores ausentes, áreas inclusivas, conservación de datos y resultados negativos. Exportaciones: contenido CSV, estructura XLSX, datos, enlaces del gráfico y texto hostil literal. Pruebas de navegador sobre el build: carga de archivos sintéticos, arrastrar/soltar, zoom/escala, ROI/base, descargas, errores, datos sin energía, vista móvil y ausencia de solicitudes externas al procesar. El XLSX también se leyó con openpyxl como validación independiente; la apariencia en Excel de escritorio aún requiere revisión manual.

## Desplegar en GitHub Pages

El workflow de CI ejecuta pruebas, build y navegador en pull requests. El workflow **Deploy GitHub Pages** se ejecuta automáticamente con cada actualización de `main`, después de instalar con lockfile, comprobar formato, ejecutar tests unitarios, compilar y pasar los tests de navegador. Si falla alguna validación, no despliega. Mantiene la opción de ejecución manual y no habilita ni modifica la configuración de Pages.

1. Revisar y fusionar el pull request.
2. En **Settings → Pages → Build and deployment**, seleccionar **GitHub Actions**.
3. A partir de ese momento, cada merge en `main` inicia automáticamente las validaciones y el despliegue; no hace falta **Run workflow**. Para reintentar una publicación se conserva esa opción.
4. Revisar el resultado y abrir el sitio en la ruta `/ats-spectrum-analizer/`.

`vite.config.js` fija esa ruta base para los assets. Playwright toma la ruta directamente de Vite, de modo que un cambio de nombre del repositorio no deja las pruebas apuntando a una ubicación anterior. Si se vuelve a renombrar el repositorio, actualizá `base` en `vite.config.js` y publicá nuevamente. El agente prepara el workflow; un cambio en una rama de revisión aún no está desplegado en el sitio público.

## Referencia

Implementación de [issue #1](https://github.com/asielhm/ats-spectrum-analizer/issues/1), ampliada con ROI arrastrable, línea base manual, sugerencias de radionúclidos y automatización a pedido del usuario. El ejecutable Windows no está en este repositorio; la versión web es independiente.
