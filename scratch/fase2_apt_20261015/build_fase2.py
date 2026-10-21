from pathlib import Path
from copy import deepcopy
from zipfile import ZipFile
from hashlib import sha256
from io import BytesIO
import json
import re
from lxml import etree as E
from docx import Document
from docx.shared import Inches

ROOT = Path(r'C:\Users\Cxris\Documents\LiteratusNovelist')
WORK = ROOT / 'scratch/fase2_apt_20261015'
REF = Path(r'C:\Users\Cxris\Downloads\2.4_GuiaEstudiante_Fase 2_DesarrolloProyecto APT - (Español).docx')
OUT = ROOT / 'outputs/fase2_grupo8_20261015/Guia_Fase_2_Desarrollo_Proyecto_APT_Literatus_Novelist_Grupo_8.docx'
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{' + NS['w'] + '}'

SUMMARY = [
('Literatus Novelist Grupo 8', True),
('Cliente: Triskeledu SpA. Equipo: Christopher Guerrero, Matias Morales, Luis Faundes y Eithan Santibáñez. Período informado: desarrollo del proyecto a partir de la semana 6 del plan académico de 18 semanas.', False),
('A partir de la semana 6 hemos trabajado sobre una plataforma de lectura existente para consolidar su evolución a Literatus Novelist V2. La base inicial ya incluía autenticación, catálogo, biblioteca, lectura, conversación con personajes, economía Tinta y administración. El desarrollo de esta etapa se concentra en mejorar la experiencia de uso, ampliar las integraciones y resolver dificultades de presentación e interacción.', False),
('El estado actual incorpora mejoras del lector, navegación por páginas o desplazamiento, conservación del progreso, marcadores, anotaciones y ajustes de lectura. También existen recuperación de contraseña, logros, La Taberna, juegos literarios, El Enigma del Tintero, El Interrogatorio a Ciegas y La Senda. Estos módulos amplían las formas de interacción y aprendizaje; sus avances se respaldan mediante capturas, implementación y pruebas documentadas, según el alcance de cada evidencia.', False),
('Dos dificultades relevantes fueron la preparación de las imágenes de los personajes y la necesidad de reconstruir La Taberna. En los retratos fue necesario cuidar la correspondencia con la obra y edición, mantener el encuadre y reducir el peso de carga. En La Taberna se reorganizaron la navegación y los componentes para integrar comunidad, Bazar e interacción social, manteniendo la gestión de planes en una sección diferenciada. Estos trabajos requirieron revisión visual, coordinación entre frontend y backend y pruebas de integración.', False),
('Los objetivos de análisis, modelamiento e implementación presentan avances respaldados por módulos, modelos de datos y rutas de la API. El objetivo de integración dispone de código para IA, voz y Webpay, aunque la validación con servicios externos sigue pendiente en parte. El objetivo de calidad tiene evidencia específica del lector: el registro del 14 y 15 de octubre informa compilación de Angular y 46 de 46 pruebas aisladas aprobadas. Esto no acredita la validación integral de la plataforma.', False),
('Se conserva el plan de 18 semanas de la fase 1. El monitoreo de este informe se realiza desde la semana 6; las duraciones iniciales de cada actividad se mantienen como referencia. Se desglosan retratos, La Taberna, juegos y La Senda para hacer visibles sus ajustes y pendientes. El avance se describe por actividad y evidencia.', False),
]
OBJECTIVES = [
('Se mantienen los objetivos de la fase 1. No se incorpora un cambio de alcance ni se declara cumplido un objetivo solo por la existencia de código.', False),
('Objetivo general', True),
('Desarrollar e integrar una plataforma web de lectura interactiva que permita gestionar obras, biblioteca personal, lectura y progreso, incorporando inteligencia artificial, narración por voz y herramientas administrativas, con el fin de ofrecer una experiencia digital guiada y escalable.', False),
('Objetivos específicos', True),
('1. Analizar y documentar los requerimientos funcionales y no funcionales del sistema.\n2. Diseñar e implementar un modelo de datos escalable para usuarios, libros, autores, lectura, compras y conversaciones.\n3. Implementar e integrar catálogo, biblioteca, lector, progreso, marcadores y notas.\n4. Integrar personajes conversacionales, narración TTS y la economía Tinta con Webpay.\n5. Validar funcionalidad, integración, seguridad, rendimiento y usabilidad, incorporando mejoras según resultados y retroalimentación del cliente.', False),
]
METHOD = [
('Se mantiene la metodología iterativa e incremental definida en la fase 1. El trabajo se organiza en análisis, diseño, implementación, pruebas y documentación. La distribución de responsabilidades sigue siendo: Eithan en requerimientos y QA; Luis en backend e integraciones; Christopher en frontend y UX; y Matias en producto y documentación.', False),
('Desde la semana 6, el seguimiento incorpora revisión visual de retratos y de La Taberna, además de comprobaciones funcionales de juegos, El Enigma, Interrogatorio y La Senda. Para los próximos incrementos se registrarán criterios de aceptación, ambiente, fecha, resultado y evidencia de cada prueba. Las integraciones externas se comprobarán primero con respuestas controladas y luego en ambientes de prueba de los proveedores. Los cambios locales se mantendrán diferenciados de las versiones desplegadas.', False),
]
EVIDENCE = [
('E1 Implementación y evolución de V2', True),
('Se presenta un inventario técnico de módulos y su comparación con la base inicial, incluido en el anexo. El historial y los archivos permiten demostrar desarrollo e integración, sin confundir código disponible con aceptación del cliente.', False),
('E2 Lector y pruebas de interacción', True),
('Se adjuntan en el anexo capturas existentes de escritorio y móvil, junto con el alcance y resultado del registro de verificación del lector. Esta evidencia relaciona lectura, progreso y personalización con el objetivo de implementación y con comprobaciones concretas de calidad.', False),
('E3 Auditorías de recuperación de contraseña y logros', True),
('Se identifican los registros conservados de 10 comprobaciones de recuperación y 12 de logros, con capturas y sin errores de ejecución o desbordamientos informados en esos recorridos. Son resultados previos de alcance específico, no una nueva ejecución ni una certificación completa.', False),
('E4 Imágenes de personajes', True),
('Se presenta el flujo de preparación, asociación y publicación de retratos, junto con el tratamiento de miniaturas e imágenes de respaldo. Esta evidencia demuestra el trabajo sobre identidad visual, rendimiento y correspondencia entre personaje, obra y edición.', False),
('E5 Reconstrucción de La Taberna', True),
('Se adjunta una captura de la Taberna social y se describe la reorganización de comunidad, Bazar, amigos, mesa e interacción. La evidencia permite revisar la interfaz reconstruida, la coordinación entre frontend y backend y los controles de compatibilidad. La imagen documenta la presentación; la validación integral de todos sus recorridos sigue pendiente.', False),
('E6 Juegos literarios', True),
('Se documentan las modalidades Ordena la historia, Une las parejas, Anagrama, Reconstruye la frase, Caza la palabra, Clasifica y Relámpago. La implementación incluye captura de respuestas, evaluación y retroalimentación. Las pruebas existentes contemplan respuestas parciales, normalización de tildes y ocultamiento de soluciones. Esta evidencia relaciona desarrollo de software con actividades de comprensión y vocabulario.', False),
('E7 El Enigma del Tintero', True),
('Se presenta el reto diario de palabras, sus pistas, teclado interactivo, intentos, progreso y estados de victoria o derrota. La implementación contempla guardado por usuario y día y consulta de la recompensa al servidor. Esta evidencia permite revisar una mecánica de juego completa y su relación con la economía Tinta y los logros.', False),
('E8 El Interrogatorio a Ciegas', True),
('Se describe la sesión de identidad oculta, preguntas limitadas, selección de sospechosos, ventajas y resolución de la partida. El módulo diferencia reto diario y práctica y administra las operaciones mediante servicios del backend. La evidencia demuestra integración de interfaz, persistencia e interacción con personajes; la calidad de las respuestas del proveedor requiere validación específica.', False),
('E9 La Senda', True),
('Se documenta el mapa de unidades y niveles, las lecturas y ejercicios, las vidas, las estrellas y el desbloqueo progresivo. Las pruebas existentes contemplan niveles bloqueados, orden de apertura de unidades, evaluación de respuestas y pruebas de salto. Esta evidencia demuestra organización del aprendizaje y seguimiento del progreso del usuario.', False),
('Resguardo de calidad', True),
('El control de versiones, las pruebas aisladas, el registro de defectos y las capturas permiten revisar cambios y reproducir comprobaciones. La matriz histórica de QA contiene 28 casos, pero sus estados no tienen una leyenda inequívoca y las celdas de evidencia están vacías. Debe normalizarse antes de calcular una tasa global de aprobación. La aceptación final de evidencias con el docente y del producto con el cliente sigue pendiente de registro.', False),
]

# Monitoreo desde S6. Se conserva el plan base y se desglosan dos actividades.
PLAN = [
['Gestión de proyectos','Requerimientos','Guía, repositorio y tablero','S1–S3','Matias / Eithan','Hay fuentes históricas inconsistentes.','En curso. Alcance descrito; trazabilidad por formalizar.','Actualizar fichas CU y separar base/V2.'],
['Modelamiento de datos','Arquitectura y datos','Django REST, PostgreSQL y Git','S2–S4','Luis','Existen modelos y migraciones.','En curso. Modelo implementado; cambios nuevos por validar.','Documentar migraciones y verificar en entorno aislado.'],
['Desarrollo de software','Frontend y lector','Angular, navegador y pruebas','S3–S8','Christopher','Hay registro de 46 pruebas aisladas del lector.','En curso. Lectura y mejoras implementadas.','Completar rendimiento, móvil físico y regresión.'],
['Desarrollo de software','Backend y API','Django REST, base de datos y Git','S3–S8','Luis','API organizada por módulos.','En curso. Rutas, modelos y servicios presentes.','Revisar contratos, permisos y nuevas integraciones.'],
['Desarrollo de software','IA y TTS','APIs de IA y voz; caché de audio','S6–S10','Luis / Christopher','Dependencia de cuotas y proveedores.','En curso. Integración implementada; validación externa parcial.','Probar disponibilidad, consumo y recuperación de fallos.'],
['Desarrollo de software','Retratos de personajes','Imágenes, manifiesto, almacenamiento y miniaturas','Desde S6','Christopher / Luis','Cuidar identidad, encuadre y peso de las imágenes.','En curso. Flujo de importación y miniaturas disponible.','Revisar retratos pendientes y unificar imágenes de respaldo.'],
['Desarrollo e integración','Reconstrucción de La Taberna','Angular, API de comunidad, Bazar y pruebas','Desde S6','Christopher / Luis; Eithan en QA','Reorganización visual y conexión de funciones sociales.','En curso. Nueva estructura y cambios locales disponibles.','Validar navegación, respuestas de API, móvil y rendimiento.'],
['Desarrollo y pruebas','Juegos, El Enigma e Interrogatorio','Angular, servicios de juego, IA y casos de prueba','Desde S6','Christopher / Luis; Eithan en QA','Mantener reglas, estados y recompensas coherentes.','En curso. Modalidades y sesiones implementadas.','Validar reanudación, fin de partida y recompensas únicas.'],
['Desarrollo y datos','La Senda','Unidades, niveles, ejercicios y progreso','Desde S6','Christopher / Luis; Eithan en QA','Coordinar desbloqueo, evaluación y guardado de avance.','En curso. Mapa, actividades y controles implementados.','Completar regresión de niveles, vidas y salto de unidad.'],
['Gestión y desarrollo','Tinta y Webpay','Backend, base de datos y sandbox','S8–S11','Luis / Eithan','Mantener saldo y evitar cargos duplicados al reintentar.','En curso. Flujo de pago y controles implementados.','Verificar confirmación, cancelación e idempotencia.'],
['Pruebas y certificación','QA y rendimiento','Casos de prueba, logs y capturas','S9–S14','Eithan / equipo','Hay evidencia puntual; falta cierre integral.','En curso. Pruebas del lector documentadas.','Normalizar QA y ejecutar regresión y concurrencia.'],
['Gestión y desarrollo','Administración y métricas','Dashboard, API y base de datos','S10–S14','Matias / Luis','Existen vistas y rutas administrativas.','En curso. Implementación presente; aceptación pendiente.','Validar métricas y permisos con criterios definidos.'],
['Pruebas y gestión','Integración y validación','Sistema, checklist y actas','S13–S16','Todo el equipo','Cambios locales y servicios externos pendientes.','En curso en implementación; validación formal sin inicio acreditado.','Ejecutar flujos completos y registrar revisión del cliente.'],
['Gestión de proyectos','Cierre y entrega','Documentación, demo y repositorio','S15–S18','Matias / equipo','Depende del cierre de integración y QA.','En curso en preparación del informe; cierre formal sin acreditar.','Consolidar evidencias, pendientes y aceptación final.'],
]
FACTORS = [
('Factores que han facilitado y dificultado el desarrollo del plan', True),
('La base de software existente facilita avanzar por incrementos y reutilizar autenticación, catálogo, biblioteca y servicios. La separación entre Angular, API Django y modelos de datos permite distribuir las tareas según los roles definidos. El historial, las pruebas y las capturas del lector aportan una evidencia concreta para revisar cambios.', False),
('Imágenes de los personajes. Una de las dificultades fue preparar retratos que representaran al personaje correcto y se vieran de manera consistente en las distintas pantallas. Fue necesario considerar la obra y edición de cada personaje para evitar asociaciones incorrectas entre nombres similares. Además, la descarga de imágenes completas para tarjetas pequeñas aumentaba el peso de carga. La implementación actual utiliza miniaturas, conserva la proporción, difiere la carga y dispone de una imagen de respaldo en el catálogo de personajes. El flujo de importación valida los archivos, los convierte a WebP y vincula cada retrato mediante su identificador. Queda por revisar la cobertura de retratos y unificar el manejo de imágenes ausentes entre las vistas.', False),
('Reconstrucción de La Taberna. Fue necesario rehacer la organización del módulo para integrar comunidad, Bazar, amigos e interacción social de forma coherente. Esto implicó reorganizar rutas y componentes, separar la comunidad de la gestión de planes y coordinar las respuestas de la API con lo que esperaba la interfaz. El historial registra correcciones de estructuras de respuesta y códigos HTTP. La escena, las animaciones y la música también requieren comprobar compatibilidad, consumo de recursos y adaptación a móvil. El código incluye pausas cuando la pestaña está oculta, opciones de movimiento reducido y una alternativa ilustrada si falla WebGL; la revisión integral de la reconstrucción continúa pendiente.', False),
('Integración de Tinta y servicios externos. Mantener coherentes el saldo, las cuotas y las operaciones entre pantallas supone una dificultad adicional. Se implementaron identificadores de solicitud y controles transaccionales para evitar repetir cargos al reintentar una operación. Las integraciones de IA, voz y pagos dependen también de configuración, cuotas y disponibilidad del proveedor. Se priorizarán pruebas de cancelación, recuperación de fallos y sincronización antes de cerrar estos flujos.', False),
('Juegos y progreso. La integración de El Enigma, Interrogatorio y La Senda requiere mantener coherencia entre las respuestas, el estado de las partidas, las recompensas y el avance guardado. La implementación separa la presentación y la evaluación, e incluye pruebas de normalización, ocultamiento de respuestas y desbloqueo. Se priorizará comprobar reanudación, límites de intentos y entrega única de premios.', False),
('Seguimiento y calidad. La reconstrucción de componentes obliga a revisar sus dependencias y actualizar las evidencias. Se propone consolidar cada ejecución con caso de uso, resultado, ambiente y evidencia; mantener el cronograma de 18 semanas y los responsables vigentes; y completar las pruebas que requieren PostgreSQL, ya que los resultados aislados en SQLite no acreditan su concurrencia.', False),
]
ADJUSTMENTS = [
('Actividades ajustadas o eliminadas', True),
('Los cambios técnicos documentados del lector incluyen el formato de una o dos páginas, controles de navegación, marcadores, conservación del pasaje y extracción de funciones de paginación. El registro de verificación del 14 y 15 de octubre respalda estos cambios y sus 46 pruebas aisladas.', False),
('Desde la semana 6 se da seguimiento específico a los retratos y a la reconstrucción de La Taberna. En los retratos, el ajuste consiste en separar la preparación visual, la asociación con el personaje y la publicación de archivos, incorporando miniaturas para su presentación. En La Taberna, el trabajo se descompone en reorganización de navegación, componentes sociales, conexión con la API y revisión visual y funcional. Este desglose hace visible el trabajo adicional de integración sin alterar el objetivo general del proyecto.', False),
('Para el seguimiento académico se propone reforzar documentación y QA dentro de las actividades ya planificadas. Se deben convertir los casos de uso en fichas con actor, precondiciones, flujo principal, alternativas y resultado; representar los diagramas gráficamente; definir y aplicar una convención de nombres consistente con los requisitos del docente; y relacionar requerimientos con implementación y pruebas. Estas correcciones documentales no se presentan como ya terminadas.', False),
('Se mantiene el horizonte de 18 semanas y la distribución principal de responsabilidades de la fase 1. El seguimiento desglosa retratos, La Taberna, juegos y La Senda, coordinados entre frontend y backend con apoyo de QA. La Carta Gantt debe reflejar este trabajo desde la semana 6 y conservar la relación con las actividades iniciales. No se registra eliminación de actividades. La publicación comercial de libros por autores externos queda fuera de los entregables acreditados en este informe.', False),
]
PENDING = [
('Actividades no iniciadas o con validación pendiente', True),
('El seguimiento de la fase 2 comienza en la semana 6. Continúan pendientes la revisión de retratos aún no asociados o con rutas de respaldo inconsistentes y la validación integral de la nueva Taberna en sus recorridos principales, vista móvil y compatibilidad gráfica. La preparación de una imagen o la presencia de un componente no implican por sí solas el cierre de la actividad.', False),
('La entrega final, la aceptación del cliente, las fichas de casos de uso y trazabilidad, la regresión integral, las pruebas de concurrencia en PostgreSQL y las validaciones externas de pagos, IA y voz requieren completar o consolidar sus evidencias. La reconstrucción de La Taberna y la revisión de imágenes se incorporan al seguimiento de prioridades. No se asigna un atraso en semanas sin una fecha comprometida y un avance semanal confirmado.', False),
('Para avanzar se propone priorizar el recorrido registro, catálogo, biblioteca, lectura, guardado de progreso y reanudación. Después se comprobarán IA, narración y pagos, incluyendo errores y cancelaciones. Cada defecto deberá registrarse con responsable y condición de cierre. Las métricas de rendimiento y usabilidad deben acordarse antes de emitir una conclusión general de calidad.', False),
('Para los retratos se propone revisar por lotes la identidad, el encuadre, la disponibilidad y la carga de cada imagen. Para La Taberna se propone comprobar navegación, Bazar, funciones sociales, permisos y respuestas de la API antes de cerrar el pulido gráfico. El cierre académico consolidará la versión entregada, documentación técnica, evidencias de prueba, demostración y registro de aceptación.', False),
]

def el(name, **attrs):
    x = E.Element(W + name)
    for k,v in attrs.items(): x.set(W+k, str(v))
    return x

def paragraph(text='', bold=False, size=20, before=0, after=90, keep=False):
    p=el('p'); pp=el('pPr'); p.append(pp)
    pp.append(el('spacing', before=before, after=after, line=250, lineRule='auto'))
    pp.append(el('jc', val='left'))
    if keep: pp.append(el('keepNext'))
    pp.append(el('widowControl'))
    for i,line in enumerate(text.split('\n')):
        r=el('r'); rp=el('rPr'); r.append(rp)
        rp.append(el('rFonts', ascii='Calibri', hAnsi='Calibri', cs='Calibri'))
        rp.append(el('color', val='000000')); rp.append(el('sz', val=size))
        rp.append(el('szCs', val=size)); rp.append(el('lang', val='es-CL'))
        if bold: rp.append(el('b'))
        if i: r.append(el('br'))
        t=el('t'); t.text=line; t.set('{http://www.w3.org/XML/1998/namespace}space','preserve'); r.append(t); p.append(r)
    return p

def fill_cell(tc, paras, size=20):
    for x in list(tc):
        if x.tag!=W+'tcPr': tc.remove(x)
    for text,bold in paras: tc.append(paragraph(text,bold,size,keep=bold))
    pr=tc.find(W+'tcPr')
    if pr is None: pr=el('tcPr'); tc.insert(0,pr)
    va=pr.find(W+'vAlign')
    if va is None: pr.append(el('vAlign',val='top'))

def add_source_doc_image(doc_body, image_path, width, caption, docrels, extra_parts, id_suffix):
    # python-docx supplies a standard DrawingML fragment; package source parts stay intact.
    temp=Document(); temp.add_picture(str(image_path), width=Inches(width))
    p=deepcopy(temp.paragraphs[-1]._p)
    blip=p.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip')
    rid='rIdFase2'+id_suffix
    blip.set('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed',rid)
    for node in p.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}docPr'):
        node.set('id',str(900+int(id_suffix))); node.set('name',caption); node.set('descr',caption)
    rel=E.SubElement(docrels,'{http://schemas.openxmlformats.org/package/2006/relationships}Relationship')
    rel.set('Id',rid); rel.set('Type','http://schemas.openxmlformats.org/officeDocument/2006/relationships/image')
    extension=image_path.suffix.lower()
    filename='fase2_evidencia_'+id_suffix+extension; rel.set('Target','media/'+filename)
    extra_parts['word/media/'+filename]=image_path.read_bytes()
    sect=doc_body.find(W+'sectPr'); doc_body.insert(doc_body.index(sect),p)
    doc_body.insert(doc_body.index(sect),paragraph(caption,size=18,after=160))

def main():
    WORK.mkdir(parents=True,exist_ok=True); OUT.parent.mkdir(parents=True,exist_ok=True)
    original=REF.read_bytes(); before=sha256(original).hexdigest()
    with ZipFile(BytesIO(original)) as zin:
        parts={i.filename:zin.read(i.filename) for i in zin.infolist()}
        infos=zin.infolist()
    tree=E.fromstring(parts['word/document.xml']); body=tree.find(W+'body'); tables=body.findall(W+'tbl')
    assert len(tables)==8
    # Fills expand as normal text flow. Floating anchors and fixed heights cannot hold long answers.
    for table in tables:
        tp=table.find(W+'tblPr')
        for x in list(tp):
            if x.tag==W+'tblpPr': tp.remove(x)
        for x in table.findall('.//w:trHeight',NS): x.getparent().remove(x)
        for x in table.findall('.//w:cantSplit',NS): x.getparent().remove(x)
    rows=tables[1].findall(W+'tr')
    for row,content in zip(rows,[SUMMARY,OBJECTIVES,METHOD,EVIDENCE]): fill_cell(row.findall(W+'tc')[1],content)
    # Keep plan headings and clone the supplied eight-column answer-row pattern.
    plan=tables[3]; prows=plan.findall(W+'tr'); proto=deepcopy(prows[2]); plan.remove(prows[2])
    for r in prows[:2]:
        rp=r.find(W+'trPr')
        if rp is None: rp=el('trPr'); r.insert(0,rp)
        rp.append(el('tblHeader'))
    for fields in PLAN:
        r=deepcopy(proto)
        for tc,text in zip(r.findall(W+'tc'),fields): fill_cell(tc,[(text,False)],size=18)
        plan.append(r)
    for i,content in zip([5,6,7],[FACTORS,ADJUSTMENTS,PENDING]): fill_cell(tables[i].find(W+'tr').find(W+'tc'),content)
    # Natural separation between the original template components.
    for table in tables[:-1]:
        body.insert(body.index(table)+1,paragraph('',size=4,after=100))
    # The narrow planning table retains the original 9 pt source pattern and grid.
    # Source page furniture, styles, geometry and source logo are preserved byte for byte.
    sect=body.find(W+'sectPr')
    def add(text,bold=False,size=20,keep=False):
        body.insert(body.index(sect),paragraph(text,bold,size,before=80,after=100,keep=keep))
    pb=paragraph(''); pb.find(W+'pPr').append(el('pageBreakBefore')); body.insert(body.index(sect),pb)
    add('Anexo de evidencias de avance',True,28,True)
    add('E1 Base inicial y evolución de V2',True,22,True)
    add('La comparación entre la base inicial y la implementación actual permite distinguir los módulos existentes de las mejoras desarrolladas. La base incluye usuarios, catálogo, biblioteca, conversación con personajes, economía y administración. La evolución incorpora mejoras del lector, comunidad, actividades de aprendizaje y ampliación de la gamificación. Esta evidencia responde a la observación de la fase 1 sobre explicar qué se conserva y qué se desarrolla en V2.')
    add('Fuentes de evidencia: historial de desarrollo, inventario de módulos y registros de verificación del proyecto. Demuestra evolución técnica y trazabilidad entre requerimientos, funcionalidades y entregables.',size=18)
    add('E2 Verificación del lector',True,22,True)
    add('El registro de verificación del lector informa compilación de Angular y 46/46 pruebas aisladas: ajustes (17), paginador (11), progreso (2) e interacciones (16). Describe comprobaciones de marcadores, navegación, búsqueda, cambio de modo y conservación del pasaje. Se utilizó un entorno aislado con SQLite. Quedan fuera de esa verificación Safari, un teléfono físico y una voz Azure real; la compilación de producción y la comparación final de rendimiento se reservan para trabajo posterior.')
    rels=E.fromstring(parts['word/_rels/document.xml.rels']); extras={}
    add_source_doc_image(body,ROOT/'docs/lector-fase3/escritorio-1440.jpg',5.7,'Figura 1 Lector de escritorio a 1440 por 900 píxeles. Registro visual del formato de lectura en dos páginas.',rels,extras,'1')
    add_source_doc_image(body,ROOT/'docs/lector-fase3/movil-375.jpg',2.0,'Figura 2 Lector móvil a 375 por 812 píxeles. Registro visual de lectura en una página.',rels,extras,'2')
    add('E3 Registros de auditorías específicas',True,22,True)
    add('La auditoría de recuperación de contraseña conserva 10 comprobaciones y 20 capturas. La auditoría de Logros V2 conserva 12 comprobaciones y 10 capturas. Ambos registros informan cero errores de ejecución y desbordamientos para sus recorridos. Estos resultados se citan como evidencia conservada, sin extenderlos a todos los módulos ni considerarlos una nueva ejecución.',size=20)
    add('E4 Imágenes de personajes',True,22,True)
    add('La documentación del flujo de retratos describe revisión de identidad, validación de archivos, conversión WebP y publicación por lotes. La implementación del catálogo de personajes utiliza miniaturas y mantiene la asociación con obra y edición; existen pruebas de duplicados, selección y carga de respaldo. La evidencia demuestra cómo se abordaron el peso de carga y la consistencia visual. La revisión completa de los retratos sigue pendiente.',size=20)
    add('E5 Reconstrucción de La Taberna',True,22,True)
    add('La nueva organización separa la comunidad y El Bazar de la gestión de planes. La captura adjunta muestra la mesa virtual, personajes, controles de música y espacio de interacción. La implementación incorpora navegación, funciones sociales, permisos, límites de actualización y recuperación gráfica. El historial registra correcciones de integración entre las respuestas del servidor y la interfaz. Esta evidencia respalda el trabajo de reconstrucción y su presentación visual.',size=20)
    add_source_doc_image(body,ROOT/'scratch/tavern-menu-collapsed.jpg',5.7,'Figura 3 La Taberna reconstruida con mesa virtual, personajes y controles de interacción. Captura existente del desarrollo; no acredita por sí sola todos los flujos sociales.',rels,extras,'3')
    add('El registro anterior de la capa económica conserva 70 pruebas de backend y 9 de frontend aprobadas, con dos de PostgreSQL omitidas. La auditoría visual anterior utiliza datos controlados. Son antecedentes de planes y cuotas; la nueva Taberna social requiere su propia validación integral.',size=18)
    add('E6 Juegos literarios',True,22,True)
    add('El inventario de actividades incluye siete modalidades: Ordena la historia, Une las parejas, Anagrama, Reconstruye la frase, Caza la palabra, Clasifica y Relámpago. Los componentes permiten seleccionar, ordenar o relacionar elementos y recibir retroalimentación. El motor de evaluación distingue el tipo de respuesta, admite puntuación parcial en actividades con varias piezas y prepara las soluciones después de responder.',size=20)
    add('Como evidencia técnica, los casos de prueba existentes comprueban que dos parejas correctas de cuatro obtengan medio puntaje, que un anagrama se compare sin diferencias por tildes o mayúsculas y que la versión de una pregunta enviada al navegador no incluya su respuesta. Estos casos respaldan reglas de evaluación; no se presentan como una nueva ejecución de la suite.',size=20)
    add('Relación con los objetivos: implementación de interacciones, integración entre interfaz y evaluación y verificación de reglas de negocio. Pendiente: regresión completa en navegador de cada modalidad, controles táctiles y consistencia de recompensas.',size=18)
    add('E7 El Enigma del Tintero',True,22,True)
    add('La pantalla implementada presenta un reto diario con pista, palabra oculta, teclado interactivo y cinco intentos de error. Distingue partida en curso, victoria y derrota, reconoce vocales con acento y conserva el estado por usuario y día. La recompensa se solicita al servidor, que mantiene el vínculo con la actividad y los logros.',size=20)
    add('Evidencia técnica disponible: reglas y estados de la interfaz, lógica de selección de letras, guardado y recuperación de la partida y un caso de prueba que relaciona resolver el enigma con su logro. La revisión de fin de partida, abandono, recarga y entrega única de recompensa se incorpora a los criterios de aceptación.',size=20)
    add('Justificación: permite evidenciar una funcionalidad completa de juego, persistencia del progreso e integración con Tinta y logros. Su valor educativo se plantea como apoyo al reconocimiento de obras y vocabulario; no se afirma una mejora de aprendizaje ya medida.',size=18)
    add('E8 El Interrogatorio a Ciegas',True,22,True)
    add('La implementación crea una sesión con identidad oculta y un conjunto de sospechosos. El usuario formula preguntas limitadas y elige al personaje que considera correcto. Se distinguen reto diario y práctica; también hay acciones de pregunta adicional, pista y descarte de candidatos. El servidor administra la sesión, el consumo y la resolución de la partida.',size=20)
    add('Evidencia técnica disponible: interfaz de preguntas y sospechosos, servicios para iniciar, preguntar, obtener ventajas, responder y abandonar, y un caso de prueba asociado al logro del Interrogatorio. La persistencia de sesión permite relacionar interfaz, modelos de datos y lógica del backend.',size=20)
    add('Pendiente: comprobar el recorrido completo con el proveedor de IA, la calidad de las respuestas, el manejo de fallos y el cierre de cada modalidad. La existencia de la interfaz no garantiza que la IA nunca revele pistas indebidas; ese comportamiento debe evaluarse expresamente.',size=18)
    add('E9 La Senda',True,22,True)
    add('La Senda organiza lecturas y ejercicios en unidades y niveles con un mapa de progreso. Incluye vidas, racha, estrellas y apertura de contenido según los resultados. Las actividades alternan lectura, preguntas, juegos y pruebas de unidad. El reproductor de niveles comparte el motor de evaluación y registra el avance.',size=20)
    add('Evidencia técnica disponible: mapa de unidades y niveles, contenido organizado por actividad, controles de acceso y pruebas existentes sobre niveles bloqueados, apertura de unidades, ocultamiento de respuestas, puntuación y prueba de salto. El registro de Logros V2 informa una verificación anterior de 184 pruebas en módulos relacionados, con SQLite; ese total no se atribuye exclusivamente a La Senda ni sustituye su revisión integral.',size=20)
    add_source_doc_image(body,ROOT/'respaldos-software/LiteratusNovelist-main/Producto/frontend/docs/audits/logros-v2/achievements-default-1440.png',5.7,'Figura 4 Panel de logros y accesos a La Senda, El Enigma e Interrogatorio. Captura de auditoría con datos de prueba; sus cifras no representan el avance académico.',rels,extras,'4')
    add('Justificación: demuestra organización de actividades, modelamiento de progreso, integración de reglas de desbloqueo y relación con logros y recompensas. Pendiente: verificar reanudación, navegación móvil, recuperación de vidas y consistencia del avance entre sesiones.',size=18)
    add('Fuentes de planificación y seguimiento',True,22,True)
    add('Guía de fase 1 del Grupo 8 y su planilla de evaluación; registro de verificación del lector; auditorías de recuperación de contraseña y Logros V2; documentación de retratos y de la capa económica de La Taberna; inventario de módulos; implementación y casos de prueba de comunidad, juegos, El Enigma, Interrogatorio y La Senda.',size=18)
    parts['word/document.xml']=E.tostring(tree,xml_declaration=True,encoding='UTF-8',standalone=True)
    parts['word/_rels/document.xml.rels']=E.tostring(rels,xml_declaration=True,encoding='UTF-8',standalone=True)
    ct=E.fromstring(parts['[Content_Types].xml']); ctn='{http://schemas.openxmlformats.org/package/2006/content-types}'
    if not any(x.get('Extension')=='jpg' for x in ct):
        x=E.SubElement(ct,ctn+'Default'); x.set('Extension','jpg'); x.set('ContentType','image/jpeg')
    parts['[Content_Types].xml']=E.tostring(ct,xml_declaration=True,encoding='UTF-8',standalone=True)
    with ZipFile(OUT,'w') as zout:
        for i in infos: zout.writestr(i,parts[i.filename])
        for name,data in extras.items(): zout.writestr(name,data)
    # Structural and fidelity checks; visual rendering is unavailable on this host.
    changed=[n for n in parts if sha256(parts[n]).hexdigest()!=sha256(ZipFile(BytesIO(original)).read(n)).hexdigest()]
    assert set(changed)<={'word/document.xml','word/_rels/document.xml.rels','[Content_Types].xml'}
    assert sha256(REF.read_bytes()).hexdigest()==before
    final=Document(OUT)
    assert len(final.tables)==8 and len(final.tables[3].rows)==16
    assert len(final.sections)==1 and final.sections[0].page_width==Document(REF).sections[0].page_width
    text='\n'.join(p.text for p in final.paragraphs)+'\n'+'\n'.join(c.text for t in final.tables for r in t.rows for c in r.cells)
    assert not re.search('[\U0001F300-\U0001FAFF\u2600-\u27BF]',text)
    for placeholder in ['Opcional en caso de ajuste','Nombra las actividades','Describe la(s) evidencia(s)']:
        assert placeholder not in text
    assert 'a partir de la semana 6' in text and 'semana de corte académico queda por confirmar' not in text
    assert 'Retratos de personajes' in text and 'Reconstrucción de La Taberna' in text
    assert all(label in text for label in ['E5 Reconstrucción de La Taberna','E6 Juegos literarios','E7 El Enigma del Tintero','E8 El Interrogatorio a Ciegas','E9 La Senda'])
    assert not re.search(r'(?i)(?:(?<![a-z])[A-Z]:[\\/]|file://|/Users/|\\Users\\|Cxris|respaldos-software|src/app|docs/|Producto/)',text)
    for name,data in parts.items():
        if name.endswith('.xml'):
            assert not re.search(r'(?i)(?:(?<![a-z])[A-Z]:[\\/]|file://|/Users/|\\Users\\|Cxris)',data.decode('utf-8',errors='ignore')), name
    (WORK/'contenido_final.txt').write_text(text,encoding='utf-8')
    audit={'output':str(OUT),'template_sha256':before,'template_unchanged':True,'changed_parts':changed,'preserved_parts':len(parts)-len(changed),'added_images':len(extras),'tables':len(final.tables),'plan_rows':len(final.tables[3].rows)-2,'sections':len(final.sections),'no_emojis':True,'visual_check':'Blocked: LibreOffice/Word renderer unavailable; no page PNGs generated.'}
    (WORK/'qa.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(audit,ensure_ascii=True))

if __name__=='__main__': main()
