# ATOMTEX Spectrum Analyzer Web

Aplicación web para visualizar espectros gamma ATOMTEX (.ats) y exportarlos a Excel/CSV.

## Objetivo de la primera versión
- Cargar un archivo `.ats` desde el equipo sin enviarlo a servidores.
- Interpretar los bloques `SPECTR`, `ECALIBRATION` y metadatos disponibles.
- Graficar canales / energía (keV) contra cuentas, con zoom y escala lineal/logarítmica.
- Exportar datos crudos en CSV y XLSX, incluyendo metadatos y un gráfico.
- Mostrar errores claros si el formato es incompatible o faltan datos.
- Funcionar en GitHub Pages bajo la ruta `/ATOMTEX-Analyzer/`.

## Desarrollo con Codex
La especificación completa está en [issue #1](https://github.com/asielhm/ATOMTEX-Analyzer/issues/1).

**Instrucción para Codex:** «Implementá la issue #1 de este repositorio. Creá una rama y un pull request, agregá tests del parser ATS y documentá cómo desplegar en GitHub Pages. No supongas la estructura del archivo ATS: validala con una muestra real; si falta, pedila y dejá claramente documentada esa limitación».

## Estado
Repositorio inicializado. La aplicación web todavía no está implementada.

## Privacidad
Los archivos de medición deben procesarse exclusivamente en el navegador. No se debe enviar contenido de los espectros a servidores externos.

## Nota
El ejecutable Windows de ATOMTEX Analyzer no está en este repositorio. La versión web es un proyecto independiente.
