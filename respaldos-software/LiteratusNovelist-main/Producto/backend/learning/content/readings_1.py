"""Lecturas de las unidades 1 a 5. Textos originales del Taller Literatus (salvo 1.1)."""

from .fmt import mc, reading, tf

READINGS = {}

# ── Unidad 1 — Comprensión básica ────────────────────────────────────────────

READINGS[(1, 1)] = reading(
    title='El Principito y el Zorro',
    author='Antoine de Saint-Exupéry',
    source_type='classic_book',
    pages=[
        "Fue entonces cuando apareció el zorro:\n—Buenos días —dijo el zorro.\n—Buenos días —respondió cortésmente el principito, que se volvió pero no vio nada.\n—Estoy aquí —dijo la voz—, bajo el manzano.\n—¿Quién eres tú? —preguntó el principito—. Eres muy lindo...\n—Soy un zorro —dijo el zorro.\n—Ven a jugar conmigo —le propuso el principito—; ¡estoy tan triste!...",
        "—No puedo jugar contigo —dijo el zorro—. No estoy domesticado.\n—¡Ah! Perdón —dijo el principito.\nPero después de una breve reflexión, añadió:\n—¿Qué significa 'domesticar'?\n—Es una cosa ya olvidada —dijo el zorro—. Significa 'crear lazos'...",
    ],
    questions=[],
    raw_questions=[
        {
            'id': 'u1_l1_q1', 'type': 'single_choice',
            'prompt': '¿Por qué el zorro le dice al principito que no puede jugar con él?',
            'options': [
                {'id': 'a', 'text': 'Porque tiene miedo a los humanos', 'is_correct': False},
                {'id': 'b', 'text': 'Porque aún no está domesticado', 'is_correct': True},
                {'id': 'c', 'text': 'Porque tiene prisa por cazar', 'is_correct': False},
                {'id': 'd', 'text': 'Porque está enfadado con él', 'is_correct': False},
            ],
            'explanation': 'El zorro aclara de inmediato: "No puedo jugar contigo. No estoy domesticado."',
        },
        {
            'id': 'u1_l1_q2', 'type': 'character_role',
            'prompt': '¿Quién inicia la conversación saludando primero?',
            'options': [
                {'id': 'a', 'text': 'El principito', 'is_correct': False},
                {'id': 'b', 'text': 'El zorro', 'is_correct': True},
                {'id': 'c', 'text': 'El aviador', 'is_correct': False},
                {'id': 'd', 'text': 'La flor', 'is_correct': False},
            ],
            'explanation': 'El texto indica: "Fue entonces cuando apareció el zorro: —Buenos días —dijo el zorro."',
        },
        {
            'id': 'u1_l1_q3', 'type': 'context_vocabulary',
            'prompt': 'Según la explicación del zorro, ¿qué significa la palabra "domesticar"?',
            'target_word': 'domesticar',
            'options': [
                {'id': 'a', 'text': 'Encerrar a un animal en una jaula', 'is_correct': False},
                {'id': 'b', 'text': 'Crear lazos y vínculos afectivos', 'is_correct': True},
                {'id': 'c', 'text': 'Enseñar trucos y piruetas', 'is_correct': False},
                {'id': 'd', 'text': 'Olvidar el pasado salvaje', 'is_correct': False},
            ],
            'explanation': 'El zorro define claramente domesticar como "crear lazos".',
        },
        {
            'id': 'u1_l1_q4', 'type': 'true_false',
            'prompt': '¿El principito se sentía alegre y festivo antes de encontrarse con el zorro?',
            'options': [
                {'id': 'true', 'text': 'Verdadero', 'is_correct': False},
                {'id': 'false', 'text': 'Falso', 'is_correct': True},
            ],
            'explanation': 'El principito le pide al zorro que juegue con él diciendo expresamente: "¡estoy tan triste!"',
        },
    ],
    vocab=[('manzano', 'Árbol que da manzanas'), ('cortésmente', 'Con educación y amabilidad')],
    events=[
        'Aparece el zorro bajo el manzano y saluda.',
        'El principito le pide que juegue con él.',
        'El zorro responde que no está domesticado.',
        'El zorro explica que domesticar significa "crear lazos".',
    ],
)

READINGS[(1, 2)] = reading(
    title='El faro de Isla Gris',
    pages=[
        "En la punta más alejada de Isla Gris vivía Aurelio, el guardián del faro. Hacía años que los barcos grandes habían cambiado de ruta, y casi nadie pasaba ya por aquellas aguas. Aun así, cada tarde Aurelio subía los ciento doce peldaños, limpiaba el cristal con un paño de lana y encendía la lámpara.\n"
        "Los pescadores del pueblo se burlaban de él: «¿Para quién alumbras, viejo? ¿Para las gaviotas?». Aurelio sonreía y seguía subiendo.\n"
        "Una noche de invierno, una tormenta sorprendió a una pequeña barca de pescadores. Las ráfagas de viento eran tan fuertes que no se veía ni la proa. Entonces, entre la lluvia, apareció una luz firme y amarilla. Era el faro. Guiándose por ella, la barca llegó a salvo al puerto.\n"
        "A la mañana siguiente, los pescadores subieron por primera vez los ciento doce peldaños. No dijeron nada: solo ayudaron a Aurelio a limpiar el cristal."
    ],
    questions=[
        mc('single_choice', '¿Cuál es la idea principal del texto?',
           ['Cumplir con el deber tiene sentido aunque nadie parezca notarlo.',
            'Los faros ya no sirven en la actualidad.',
            'Las gaviotas necesitan luz para orientarse.',
            'Los pescadores del pueblo eran malas personas.'],
           'La constancia de Aurelio, que parecía inútil, salva a los pescadores: esa es la enseñanza central.'),
        mc('single_choice', '¿Qué detalle es secundario, es decir, no cambia la idea principal?',
           ['Aurelio limpiaba el cristal con un paño de lana.',
            'El faro guió a la barca durante la tormenta.',
            'Aurelio encendía la lámpara cada tarde.',
            'La barca llegó a salvo al puerto.'],
           'El paño de lana es un dato de ambientación: si se quita, la idea central no cambia.'),
        mc('inference_prediction', '¿Qué muestran los pescadores al subir y ayudar sin decir nada?',
           ['Que reconocen su error y agradecen a Aurelio.',
            'Que quieren quedarse con el faro.',
            'Que siguen burlándose de él.',
            'Que están cansados por la tormenta.'],
           'Sus acciones reemplazan a las palabras: ayudar es su forma de agradecer y pedir disculpas.'),
    ],
    vocab=[('ráfagas', 'Golpes de viento fuertes y repentinos'), ('peldaños', 'Escalones de una escalera')],
    events=[
        'Los barcos grandes cambian de ruta.',
        'Los pescadores se burlan de Aurelio.',
        'Una tormenta sorprende a una barca.',
        'Los pescadores ayudan a limpiar el faro.',
    ],
)

READINGS[(1, 4)] = reading(
    title='La feria del libro de Villalba',
    pages=[
        "El sábado se inauguró la feria del libro de Villalba, en la plaza principal. Abrió sus puertas a las diez de la mañana y reunió a cuarenta librerías de la región. Según los organizadores, el primer día la visitaron más de tres mil personas.\n"
        "Para mí, es la mejor feria que ha tenido el pueblo. Los puestos de libros antiguos son, sin duda, los más bonitos, aunque los precios me parecieron exagerados. Hubo una charla sobre poesía que duró una hora y media; algunos dirán que fue larga, pero yo la encontré fascinante.\n"
        "La feria continuará hasta el domingo 12, con horario de diez a veinte horas. Vale la pena ir, aunque sea solo para respirar ese olor a papel que tanto extrañamos."
    ],
    questions=[
        mc('single_choice', '¿Cuál de estas frases es un HECHO?',
           ['La feria reunió a cuarenta librerías de la región.',
            'Es la mejor feria que ha tenido el pueblo.',
            'Los puestos de libros antiguos son los más bonitos.',
            'Vale la pena ir a la feria.'],
           'El número de librerías se puede comprobar; las demás frases expresan gustos del autor.'),
        mc('single_choice', '¿Qué palabra delata que «los puestos antiguos son los más bonitos» es una opinión?',
           ['bonitos', 'puestos', 'antiguos', 'libros'],
           '«Bonitos» es un juicio de valor: depende del gusto de quien mira.'),
        tf('Que la charla de poesía durara una hora y media es una opinión.', False,
           'La duración se puede medir: es un hecho. Lo que es opinión es que fuera «larga» o «fascinante».'),
    ],
    vocab=[('inauguró', 'Dio comienzo a algo de manera oficial'), ('exagerados', 'Que exceden lo normal o razonable')],
)

# ── Unidad 2 — Vocabulario y contexto ───────────────────────────────────────

READINGS[(2, 1)] = reading(
    title='El mercader taciturno',
    pages=[
        "En la posada del camino real se hospedaba un mercader taciturno que apenas respondía a los saludos. Llevaba una capa raída y un baúl pesado que nunca perdía de vista. Los viajeros, ávidos de novedades, inventaban historias sobre él: que si era un príncipe arruinado, que si escondía oro, que si huía de la justicia.\n"
        "Una madrugada, el baúl se abrió por accidente al bajar la escalera. No cayeron monedas ni joyas, sino decenas de libros gastados. El mercader los recogió en silencio, uno por uno, con un cuidado casi tierno.\n"
        "—Son lo único que me queda de mi biblioteca —dijo por fin—. Los llevo a la ciudad para que alguien más los lea.\n"
        "Desde ese día, nadie volvió a llamarlo extraño. Lo llamaban, simplemente, el librero."
    ],
    questions=[
        mc('synonym_replacement', 'En «un mercader taciturno», ¿qué palabra puede reemplazar a «taciturno» sin cambiar el sentido?',
           ['callado', 'alegre', 'hablador', 'generoso'],
           'Taciturno describe a alguien silencioso y reservado, como el mercader que apenas saludaba.'),
        mc('context_vocabulary', '«Los viajeros, ávidos de novedades». ¿Qué significa «ávidos» aquí?',
           ['Deseosos, con muchas ganas', 'Cansados, aburridos', 'Temerosos, asustados', 'Enojados, molestos'],
           'Los viajeros querían noticias con tanta intensidad que inventaban historias.'),
        mc('single_choice', '¿Qué había realmente en el baúl?',
           ['Libros gastados de su antigua biblioteca', 'Monedas de oro', 'Joyas de un príncipe', 'Ropa de viaje'],
           'Al abrirse el baúl cayeron «decenas de libros gastados».'),
    ],
    vocab=[('raída', 'Muy gastada por el uso'), ('madrugada', 'Primeras horas del día, antes de amanecer')],
    events=[
        'El mercader llega a la posada con su baúl.',
        'Los viajeros inventan historias sobre él.',
        'El baúl se abre al bajar la escalera.',
        'Todos empiezan a llamarlo «el librero».',
    ],
)

READINGS[(2, 2)] = reading(
    title='Una vela para el velero',
    pages=[
        "Marina trabajaba en el puerto arreglando velas de barco. Una tarde se cortó la luz en todo el barrio, y su abuelo encendió una vela sobre la mesa.\n"
        "—Qué curioso —dijo Marina—: con una vela navego y con otra vela leo.\n"
        "—Y con otra vela cuido tu sueño —respondió el abuelo—, porque cuando estás enferma paso la noche en vela.\n"
        "Marina se rió y se sentó en el banco de la cocina. Recordó que esa mañana había ido al banco a pagar el alquiler del taller, y que desde el muelle había visto un banco de peces plateados.\n"
        "«Las palabras son como los barcos», pensó: «la misma forma puede llevar cargas distintas».\n"
        "Esa noche escribió en una hoja de su cuaderno todas las palabras con doble vida que se le ocurrieron. Afuera, el viento movía las hojas del limonero."
    ],
    questions=[
        mc('context_vocabulary', 'En «paso la noche en vela», ¿qué significa «en vela»?',
           ['Sin dormir', 'Con una lámpara encendida', 'Navegando en un barco', 'Muy asustado'],
           '«Pasar la noche en vela» es no dormir, en este caso para cuidar a Marina.'),
        mc('single_choice', '¿Qué tienen en común «vela», «banco» y «hoja» en el texto?',
           ['Cada una aparece con significados distintos', 'Todas son objetos del barco',
            'Todas significan lo mismo', 'Son palabras inventadas por Marina'],
           'Son palabras polisémicas: una sola forma con varios significados según el contexto.'),
        mc('fill_blank', 'Completa según el texto: «Desde el muelle había visto un banco de ___ plateados».',
           ['peces', 'nubes', 'barcos', 'piedras'],
           'Un «banco de peces» es un grupo numeroso de peces que nadan juntos.'),
    ],
    vocab=[('muelle', 'Construcción del puerto donde atracan los barcos'), ('taller', 'Lugar donde se hace un trabajo manual')],
)

READINGS[(2, 4)] = reading(
    title='El hidalgo y el mesonero',
    pages=[
        "—Buen hombre —dijo el hidalgo al entrar en la venta—, ¿tendría vuestra merced un rincón donde reposar y algo que llevar a la boca?\n"
        "—A fe mía que sí, señor —respondió el mesonero—, aunque no hay más que pan duro y un caldo que ha visto días mejores.\n"
        "—Mejor es eso que nada —replicó el hidalgo—, que a buen hambre no hay pan duro.\n"
        "Y hete aquí que, mientras comía, el hidalgo empezó a contar sus hazañas: gigantes vencidos, princesas rescatadas, dragones que huían al verlo. El mesonero lo escuchaba mirándolo de hito en hito, sin pestañear.\n"
        "—Pardiez —dijo al fin—, que vuestra merced ha vivido más que diez caballeros juntos.\n"
        "—Así es —contestó el hidalgo, sonriendo—, aunque la mayor parte de esas aventuras las he vivido en los libros."
    ],
    questions=[
        mc('context_vocabulary', '¿A quién se dirige el hidalgo al decir «vuestra merced»?',
           ['Al mesonero, de forma respetuosa', 'A sí mismo', 'A un rey', 'A su caballo'],
           '«Vuestra merced» era una forma cortés de dirigirse a otra persona; de ella viene nuestro «usted».'),
        mc('context_vocabulary', '¿Qué significa mirar a alguien «de hito en hito»?',
           ['Mirarlo fijamente, sin apartar la vista', 'Mirarlo de reojo', 'Mirarlo con enojo', 'Mirar hacia el suelo'],
           'Mirar «de hito en hito» es fijar la vista; el texto lo refuerza con «sin pestañear».'),
        mc('inference_prediction', '¿Qué revela el final sobre las hazañas del hidalgo?',
           ['Que las ha vivido leyendo, no en la realidad', 'Que fue un gran guerrero',
            'Que el mesonero lo acompañó', 'Que mintió para no pagar la comida'],
           'Él mismo confiesa que la mayor parte de esas aventuras «las he vivido en los libros».'),
    ],
    vocab=[('venta', 'Posada antigua junto a un camino'), ('hazañas', 'Hechos valerosos e importantes')],
    events=[
        'El hidalgo pide descanso y comida.',
        'El mesonero le ofrece pan duro y caldo.',
        'El hidalgo cuenta sus hazañas.',
        'Confiesa que las vivió en los libros.',
    ],
)

# ── Unidad 3 — Personajes y motivaciones ────────────────────────────────────

READINGS[(3, 1)] = reading(
    title='La niña que cruzó el río',
    pages=[
        "El puente de Aldealta se derrumbó con la crecida de marzo, y la medicina para el abuelo de Inés estaba al otro lado del río, en la botica del pueblo vecino. Los adultos discutían si esperar a que bajara el agua o construir una balsa, pero nadie se decidía.\n"
        "Inés tenía once años y conocía el río mejor que nadie: había pasado todos los veranos saltando por sus piedras. Sabía que, río arriba, junto al molino viejo, el cauce se estrechaba entre dos rocas grandes.\n"
        "No fue fácil. El agua le mojó las rodillas y dos veces estuvo a punto de resbalar. Pero cruzó, compró la medicina y volvió antes del anochecer.\n"
        "Cuando le preguntaron si no había tenido miedo, respondió:\n"
        "—Muchísimo. Pero tenía más miedo de que el abuelo no mejorara."
    ],
    questions=[
        mc('character_role', '¿Quién es la protagonista del relato?',
           ['Inés', 'El abuelo', 'El boticario', 'Los adultos del pueblo'],
           'La historia gira en torno a Inés y su decisión de cruzar el río.'),
        mc('single_choice', '¿Cuál es la motivación de Inés para cruzar?',
           ['Conseguir la medicina para su abuelo', 'Demostrar que era valiente',
            'Jugar en las piedras del río', 'Visitar el molino viejo'],
           'Ella misma lo dice: temía que su abuelo no mejorara.'),
        tf('Según el texto, Inés no sintió ningún miedo al cruzar.', False,
           'Responde «Muchísimo»: el héroe no es quien no siente miedo, sino quien actúa a pesar de él.'),
    ],
    vocab=[('crecida', 'Aumento del caudal de un río'), ('botica', 'Farmacia antigua')],
    events=[
        'La crecida derrumba el puente.',
        'Los adultos discuten sin decidirse.',
        'Inés cruza por el paso junto al molino.',
        'Inés vuelve con la medicina antes del anochecer.',
    ],
)

READINGS[(3, 2)] = reading(
    title='El administrador del molino',
    pages=[
        "Don Severo administraba el molino de la comarca y cobraba a los campesinos por moler su trigo. Cada año subía un poco el precio, y cada año los campesinos pagaban, porque no había otro molino en muchas leguas.\n"
        "Cuando el joven Tomás propuso construir un molino entre todos, junto al arroyo, don Severo sonrió con frialdad.\n"
        "—Háganlo —dijo—. Pero recuerden quién les presta las semillas cada primavera.\n"
        "Tomás no se dejó asustar. Reunió a los vecinos, repartió el trabajo y, en un verano, el nuevo molino giraba.\n"
        "Aquella noche, don Severo contó sus monedas a solas. No sentía rabia, sino algo más extraño: miedo. Durante años había confundido el respeto con la necesidad, y ahora que nadie lo necesitaba, descubrió que nadie lo respetaba."
    ],
    questions=[
        mc('character_role', '¿Qué papel cumple don Severo en la historia?',
           ['Antagonista: se opone al plan de Tomás', 'Protagonista', 'Narrador de la historia',
            'Secundario que ayuda a Tomás'],
           'Don Severo amenaza a los vecinos para impedir el nuevo molino.'),
        mc('inference_prediction', '¿Qué insinúa don Severo al recordar que presta las semillas?',
           ['Una amenaza: podría dejar de prestarlas', 'Un regalo para el nuevo molino',
            'Que está orgulloso de Tomás', 'Que ya no le quedan semillas'],
           'No lo dice directamente, pero da a entender que castigará a quienes lo desafíen.'),
        mc('single_choice', '¿Qué descubre don Severo al final?',
           ['Que lo obedecían por necesidad, no por respeto', 'Que había ganado más dinero',
            'Que Tomás era su hijo', 'Que el molino nuevo se había roto'],
           'El texto lo dice: había «confundido el respeto con la necesidad».'),
    ],
    vocab=[('comarca', 'Territorio con varios pueblos cercanos'), ('leguas', 'Antigua medida de distancia, de unos cinco kilómetros')],
    events=[
        'Don Severo sube cada año el precio.',
        'Tomás propone un molino entre todos.',
        'Los vecinos construyen el molino en un verano.',
        'Don Severo cuenta sus monedas a solas.',
    ],
)

READINGS[(3, 4)] = reading(
    title='El cartero de Valdeluz',
    pages=[
        "Todos en Valdeluz recuerdan la historia de Clara, la pintora que ganó el gran premio de la capital. Pocos recuerdan a Ramiro, el cartero.\n"
        "Durante tres años, Ramiro llevó a la casa de Clara los sobres de rechazo de los concursos. Cada vez que entregaba uno, se quedaba un momento en la puerta y comentaba algún cuadro: «Ese cielo parece que se mueve», «Ese perro me mira a mí». No sabía de pintura, pero sabía mirar.\n"
        "El día que llegó la carta del premio, Ramiro no la dejó en el buzón. Llamó a la puerta, se quitó la gorra y esperó a que Clara la abriera.\n"
        "En la ceremonia, la pintora agradeció a su familia y a sus maestros. Pero, al bajar del escenario, buscó entre el público a un hombre con gorra azul y le dio un abrazo que nadie entendió."
    ],
    questions=[
        mc('character_role', '¿Qué tipo de personaje es Ramiro en esta historia?',
           ['Secundario, pero decisivo para la protagonista', 'Protagonista absoluto',
            'Antagonista que se opone a Clara', 'Narrador en primera persona'],
           'Ramiro no es el centro de la historia, pero su apoyo acompañó a Clara durante años.'),
        mc('inference_prediction', '¿Por qué Clara abraza a Ramiro al bajar del escenario?',
           ['Porque su ánimo la sostuvo durante los años de rechazos', 'Porque él le pagó el premio',
            'Porque era su maestro de pintura', 'Porque quería devolverle la gorra'],
           'Sus comentarios sinceros la animaban cada vez que llegaba un rechazo.'),
        tf('Ramiro era un experto en pintura.', False,
           'El texto dice que «no sabía de pintura, pero sabía mirar».'),
    ],
    vocab=[('buzón', 'Caja donde se depositan las cartas'), ('ceremonia', 'Acto solemne, como la entrega de un premio')],
    events=[
        'Ramiro entrega cartas de rechazo durante tres años.',
        'Ramiro comenta los cuadros de Clara en la puerta.',
        'Ramiro entrega en mano la carta del premio.',
        'Clara abraza a Ramiro tras la ceremonia.',
    ],
)

# ── Unidad 4 — Secuencia narrativa ──────────────────────────────────────────

READINGS[(4, 1)] = reading(
    title='La carta perdida',
    pages=[
        "El lunes, Julián escribió una carta a su hermana, que vivía en el sur. La dobló con cuidado, la metió en un sobre y, antes de salir al trabajo, la dejó sobre la mesa para enviarla más tarde.\n"
        "Al mediodía, su gato saltó a la mesa y el sobre cayó detrás del mueble. Por la tarde, Julián buscó la carta por toda la casa sin encontrarla. Cansado, decidió escribir otra, más corta, y la envió esa misma noche.\n"
        "Pasaron dos semanas. Un sábado, mientras limpiaba, movió el mueble y encontró el primer sobre, cubierto de polvo. Lo abrió y leyó su propia letra: le pareció más cariñosa que la de la segunda carta.\n"
        "Entonces sonrió, fue al correo y la envió también. Su hermana recibió así dos cartas: primero la breve y, días después, la larga."
    ],
    questions=[
        mc('single_choice', '¿Qué ocurrió inmediatamente después de que el gato saltó a la mesa?',
           ['El sobre cayó detrás del mueble', 'Julián escribió otra carta',
            'Julián fue al correo', 'Julián movió el mueble'],
           'El texto une ambos hechos: el gato saltó y el sobre cayó.'),
        mc('single_choice', '¿Qué carta recibió primero la hermana?',
           ['La carta breve', 'La carta larga', 'Las dos al mismo tiempo', 'Ninguna'],
           'La breve se envió esa misma noche; la larga, dos semanas después.'),
        mc('fill_blank', 'Completa: «Pasaron dos ___» hasta que Julián encontró el sobre.',
           ['semanas', 'días', 'meses', 'años'],
           'El marcador temporal «Pasaron dos semanas» señala el salto de tiempo.'),
    ],
    vocab=[('cariñosa', 'Que muestra afecto y ternura'), ('polvo', 'Partículas de tierra que se acumulan sobre las cosas')],
    events=[
        'Julián escribe la carta y la deja en la mesa.',
        'El gato hace caer el sobre detrás del mueble.',
        'Julián escribe y envía una carta más corta.',
        'Julián encuentra el primer sobre y lo envía.',
    ],
)

READINGS[(4, 2)] = reading(
    title='La tormenta del puerto',
    pages=[
        "El puerto de San Telmo dormía tranquilo aquella tarde de agosto. Los pescadores reparaban redes y los niños saltaban desde el muelle.\n"
        "Todo cambió cuando la campana de la iglesia empezó a sonar sin descanso: el viejo Anselmo había visto nubes negras avanzando desde el horizonte. En pocos minutos, el cielo se oscureció y el mar comenzó a golpear los barcos.\n"
        "Los hombres corrieron a asegurar las amarras. El viento arrancó tejas y lonas. Entonces alguien gritó que el bote de los hermanos Vidal seguía afuera, luchando contra olas enormes. Todo el pueblo contuvo la respiración en el muelle, mirando cómo el bote subía y desaparecía entre la espuma.\n"
        "De pronto, una ola lo empujó hacia la bocana, y los hermanos, empapados, saltaron a tierra.\n"
        "Al amanecer, el mar estaba en calma. El pueblo reparó los daños y, por la noche, celebró con una cena larga en la plaza."
    ],
    questions=[
        mc('single_choice', '¿Cuál es el detonante de la historia?',
           ['La campana suena porque Anselmo ve la tormenta acercarse', 'Los niños saltan desde el muelle',
            'El pueblo celebra una cena', 'Los hermanos saltan a tierra'],
           'El detonante es el hecho que rompe la calma y pone en marcha el conflicto.'),
        mc('single_choice', '¿Cuál es el clímax, el momento de mayor tensión?',
           ['Todo el pueblo mira al bote de los Vidal luchar contra las olas', 'Los pescadores reparan redes',
            'El mar está en calma al amanecer', 'Anselmo mira el horizonte'],
           'Es el punto en que el desenlace es más incierto: no se sabe si el bote se salvará.'),
        mc('single_choice', '¿Qué parte de la estructura es la cena en la plaza?',
           ['El desenlace', 'El inicio', 'El detonante', 'El clímax'],
           'Tras resolverse el conflicto, la cena cierra la historia.'),
    ],
    vocab=[('amarras', 'Cuerdas con que se sujeta un barco al puerto'), ('bocana', 'Entrada estrecha de un puerto')],
    events=[
        'La campana alerta de la tormenta.',
        'Los hombres aseguran las amarras.',
        'Una ola empuja el bote hacia la bocana.',
        'El pueblo celebra con una cena en la plaza.',
    ],
)

READINGS[(4, 4)] = reading(
    title='El puente de madera',
    pages=[
        "Durante años, el alcalde de Robledo prometió reparar el puente de madera que cruzaba el barranco. Cada otoño aparecía una tabla floja, y cada otoño el alcalde decía que el presupuesto no alcanzaba.\n"
        "Como el puente crujía, los carreteros empezaron a dar un rodeo de dos horas por el valle. Como tardaban más, el pan y la leche llegaban tarde al mercado. Como llegaban tarde, los compradores dejaron de venir, y varias tiendas cerraron.\n"
        "Un día de lluvia, el puente cedió al fin, sin que nadie estuviera encima. El pueblo quedó partido en dos.\n"
        "Esa misma semana, el alcalde anunció con orgullo la construcción de un puente nuevo, de piedra. Costaría diez veces más que todas las reparaciones que nunca hizo."
    ],
    questions=[
        mc('single_choice', '¿Por qué los carreteros empezaron a dar un rodeo por el valle?',
           ['Porque el puente crujía y no parecía seguro', 'Porque el camino del valle era más corto',
            'Porque el alcalde lo ordenó', 'Porque el puente ya se había derrumbado'],
           'La causa aparece marcada con «Como el puente crujía...».'),
        mc('single_choice', '¿Qué consecuencia tuvo que los productos llegaran tarde al mercado?',
           ['Los compradores dejaron de venir y cerraron tiendas', 'Se construyó un puente de piedra',
            'Llovió durante una semana', 'El alcalde bajó los impuestos'],
           'El texto encadena causas y efectos: llegar tarde → menos compradores → tiendas cerradas.'),
        mc('inference_prediction', '¿Qué critica el final del texto?',
           ['Que no reparar a tiempo terminó costando mucho más', 'Que los puentes de piedra son feos',
            'Que los carreteros eran impacientes', 'Que la lluvia es peligrosa'],
           'La ironía final muestra el costo de postergar lo necesario.'),
    ],
    vocab=[('barranco', 'Hendidura profunda del terreno'), ('presupuesto', 'Dinero previsto para los gastos')],
    events=[
        'El alcalde posterga la reparación del puente.',
        'Los carreteros dan un rodeo por el valle.',
        'Los compradores dejan de ir al mercado.',
        'El puente cede en un día de lluvia.',
    ],
)

# ── Unidad 5 — Inferencia y subtexto ────────────────────────────────────────

READINGS[(5, 1)] = reading(
    title='La taza fría',
    pages=[
        "Elena puso dos tazas sobre la mesa, como cada mañana desde hacía cuarenta años. Llenó la suya de café y la otra la dejó vacía, junto al periódico doblado que ya nadie leía.\n"
        "Afuera, el vecino regaba las plantas y la saludó con la mano. Ella respondió con una sonrisa pequeña.\n"
        "Tomó el café despacio. Cuando terminó, lavó las dos tazas, aunque solo una estaba sucia, y las guardó juntas en el mismo estante.\n"
        "Antes de salir al mercado, se detuvo frente al perchero. Acarició un abrigo gris, demasiado grande para ella, y cerró la puerta sin hacer ruido."
    ],
    questions=[
        mc('inference_prediction', '¿Qué se puede inferir sobre la persona de la segunda taza?',
           ['Que ya no está: probablemente murió o se fue', 'Que llegará tarde a desayunar',
            'Que no le gusta el café', 'Que es el vecino'],
           'La taza vacía, el periódico que «ya nadie leía» y el abrigo grande sugieren una ausencia.'),
        mc('inference_prediction', '¿Qué emoción transmite Elena sin nombrarla?',
           ['Nostalgia y tristeza', 'Enojo', 'Euforia', 'Aburrimiento'],
           'Sus gestos lentos y el cuidado con los objetos de quien falta revelan añoranza.'),
        tf('El texto dice explícitamente que Elena es viuda.', False,
           'No lo dice: es una inferencia que el lector construye a partir de pistas.'),
    ],
    vocab=[('perchero', 'Mueble para colgar abrigos y sombreros'), ('estante', 'Tabla horizontal para colocar objetos')],
    events=[
        'Elena pone dos tazas en la mesa.',
        'Saluda al vecino con una sonrisa.',
        'Lava las dos tazas y las guarda juntas.',
        'Acaricia el abrigo gris antes de salir.',
    ],
)

READINGS[(5, 2)] = reading(
    title='Informe del vecino',
    pages=[
        "Les diré la verdad, porque yo siempre digo la verdad: el joven del tercero es un desastre. Llega a medianoche, deja la bicicleta en el pasillo y escucha música extraña. Seguro que no trabaja.\n"
        "El martes, por ejemplo, lo vi salir a las seis de la mañana con una mochila enorme. Volvió a las once de la noche, lleno de barro. ¿Quién sale tan temprano, si no es para hacer algo raro?\n"
        "El jueves bajó con una bolsa de naranjas y se la dejó a la señora Pilar, la del primero, que no puede caminar. Seguramente quería algo a cambio.\n"
        "Y ayer, fíjense, lo vi con un uniforme de guardabosques. Disfraces, a su edad. En fin: yo solo cuento lo que veo."
    ],
    questions=[
        mc('single_choice', '¿Qué tipo de narrador cuenta esta historia?',
           ['Un narrador en primera persona, lleno de prejuicios', 'Un narrador omnisciente que lo sabe todo',
            'El joven del tercero', 'Un narrador objetivo, como una cámara'],
           'Habla en primera persona y juzga todo lo que ve según sus prejuicios.'),
        mc('inference_prediction', 'Según las pistas, ¿a qué se dedica probablemente el joven?',
           ['Es guardabosques y trabaja en turnos largos', 'No trabaja', 'Es músico de medianoche', 'Vende naranjas'],
           'Sale al amanecer, vuelve con barro y usa uniforme: el narrador no sabe interpretar lo que ve.'),
        tf('Podemos confiar plenamente en las conclusiones del narrador.', False,
           'Es un narrador poco fiable: sus datos son ciertos, pero sus conclusiones son prejuicios.'),
    ],
    vocab=[('guardabosques', 'Persona que cuida y vigila un bosque'), ('medianoche', 'Las doce de la noche')],
    events=[
        'El narrador acusa al joven de ser un desastre.',
        'El joven sale de madrugada con una mochila.',
        'El joven lleva naranjas a la señora Pilar.',
        'El narrador lo ve con uniforme de guardabosques.',
    ],
)

READINGS[(5, 4)] = reading(
    title='Huellas en la nieve',
    pages=[
        "Cuando el inspector Morán llegó a la cabaña, la nevada había cesado hacía una hora. El dueño denunciaba que alguien había entrado de noche y robado un reloj de oro.\n"
        "Morán observó la nieve. Había un solo rastro de huellas: iba desde la cabaña hasta el cobertizo, y volvía. Las huellas eran grandes, de bota, y se hundían mucho, como si quien caminaba cargara algo pesado.\n"
        "—¿Quién más vive aquí? —preguntó.\n"
        "—Nadie. Solo yo —respondió el dueño, que llevaba unas botas enormes con la suela cubierta de nieve fresca.\n"
        "El inspector entró al cobertizo. Bajo unos sacos encontró una caja fuerte recién movida. Sonrió, cerró su libreta y miró al dueño de la cabaña con paciencia."
    ],
    questions=[
        mc('inference_prediction', '¿Qué deduce el inspector Morán?',
           ['Que el propio dueño escondió el reloj y fingió el robo', 'Que un ladrón llegó volando',
            'Que el reloj nunca existió', 'Que el ladrón huyó por el bosque'],
           'Solo hay huellas de ida y vuelta desde la cabaña, de botas como las del dueño, y la caja está en el cobertizo.'),
        mc('single_choice', '¿Por qué importa que la nevada hubiera cesado hacía una hora?',
           ['Porque las huellas recientes no quedaron cubiertas', 'Porque hacía menos frío',
            'Porque el inspector llegó tarde', 'Porque el ladrón odiaba la nieve'],
           'Sin nieve cayendo, las huellas frescas permanecieron visibles como prueba.'),
        tf('El texto cuenta explícitamente que el dueño confesó.', False,
           'El final es abierto: el lector deduce la solución a partir de las pistas.'),
    ],
    vocab=[('cobertizo', 'Construcción sencilla para guardar cosas'), ('rastro', 'Señal que deja algo o alguien al pasar')],
    events=[
        'El dueño denuncia el robo de un reloj.',
        'Morán observa un único rastro de huellas.',
        'El dueño dice que vive solo.',
        'Morán encuentra la caja fuerte en el cobertizo.',
    ],
)
