"""Lecturas de las unidades 16 a 20. Textos originales del Taller Literatus."""

from .fmt import mc, reading, tf

READINGS = {}

# ── Unidad 16 — Tiempo y espacio narrativo ──────────────────────────────────

READINGS[(16, 1)] = reading(
    title='El pueblo que esperaba',
    pages=[
        "El pueblo de San Albino se alzaba al borde de un acantilado, donde el viento no descansaba nunca. Las casas, blancas y bajas, se apretaban unas contra otras como si tuvieran frío. Sus ventanas eran pequeñas y miraban todas hacia el mar, como ojos que esperan a alguien.\n"
        "En invierno, la niebla subía desde el agua y borraba las calles. Entonces solo se oían las campanas de la iglesia y el golpe sordo de las olas contra las rocas.\n"
        "Allí vivía Martina, que cada tarde subía al faro abandonado para mirar el horizonte. Nadie le preguntaba a quién esperaba. En San Albino, todos esperaban a alguien."
    ],
    questions=[
        mc('single_choice', '¿Qué atmósfera predomina en la descripción?',
           ['Melancólica y de espera', 'Festiva y alegre', 'Violenta y peligrosa', 'Moderna y ruidosa'],
           'La niebla, el viento y las ventanas que «esperan» crean un ambiente melancólico.'),
        mc('single_choice', '¿Qué recurso aparece en «ventanas... como ojos que esperan a alguien»?',
           ['Un símil que da vida al paisaje', 'Una onomatopeya', 'Una hipérbole', 'Una pregunta retórica'],
           'Compara las ventanas con ojos y les atribuye la espera.'),
        mc('inference_prediction', '¿Qué sugiere la frase final?',
           ['Que muchos en el pueblo esperan a alguien que partió', 'Que el pueblo prepara una fiesta',
            'Que Martina es la alcaldesa', 'Que el faro será reparado'],
           'La espera se extiende a todos: es un pueblo marcado por las ausencias.'),
    ],
    vocab=[('acantilado', 'Costa cortada casi en vertical sobre el mar'), ('niebla', 'Nube baja que dificulta la visión')],
)

READINGS[(16, 2)] = reading(
    title='La canica azul',
    pages=[
        "Don Julio abrió la caja de galletas donde guardaba los botones y, entre ellos, encontró una canica azul.\n"
        "De pronto tenía siete años y estaba de rodillas en el patio de la escuela, con las manos sucias de tierra. Frente a él, Tomasito, su mejor amigo, apuntaba con cuidado. La canica azul era el premio de la tarde. Tomasito ganó, pero al despedirse se la puso en la mano: «Guárdala tú. Mañana la recupero». Esa noche, la familia de Tomasito se mudó a otra ciudad, y nunca más volvieron a verse.\n"
        "Don Julio cerró la caja. Afuera, su nieto jugaba en la vereda.\n"
        "—Ven —le dijo—. Te voy a enseñar un juego."
    ],
    questions=[
        mc('single_choice', '¿Qué técnica temporal aparece en el segundo párrafo?',
           ['Una analepsis: un salto al pasado', 'Una prolepsis: un salto al futuro',
            'Una elipsis de veinte años hacia adelante', 'Un relato en tiempo real'],
           'La canica lleva a don Julio a recordar su infancia.'),
        mc('single_choice', '¿Qué desencadena el recuerdo de don Julio?',
           ['Encontrar la canica azul', 'Ver a su nieto', 'Una llamada de Tomasito', 'Ordenar la escuela'],
           'El objeto hace de puente entre el presente y el pasado.'),
        mc('inference_prediction', '¿Qué juego le enseñará probablemente al nieto?',
           ['A jugar a las canicas', 'A coser botones', 'A leer el periódico', 'A mudarse de ciudad'],
           'El recuerdo de la canica lo impulsa a compartir ese juego.'),
    ],
    vocab=[('canica', 'Bolita de vidrio para jugar'), ('vereda', 'Acera, camino para peatones')],
    events=[
        'Tomasito le gana la canica a Julio en el patio.',
        'La familia de Tomasito se muda de ciudad.',
        'Don Julio encuentra la canica en la caja.',
        'Don Julio llama a su nieto para jugar.',
    ],
    events_explanation='El relato empieza en el presente y salta al pasado, pero en el tiempo real el juego con Tomasito ocurrió primero.',
)

READINGS[(16, 4)] = reading(
    title='El molino de Clara',
    pages=[
        "Los primeros años en la ciudad pasaron rápido: Clara consiguió trabajo en una imprenta, aprendió los nombres de las calles y se acostumbró al ruido. Se mudó tres veces. Hizo dos amigas. Olvidó el olor del campo.\n"
        "Pero la tarde del 3 de mayo el tiempo se detuvo. Clara estaba componiendo una página cuando vio, entre las letras de plomo, el nombre de su pueblo. Dejó las pinzas sobre la mesa. Leyó la noticia una vez, despacio. Luego otra. El molino de su padre había ardido.\n"
        "Se quitó el delantal, lo dobló con cuidado, lo dejó sobre la silla y salió sin despedirse.\n"
        "Diez años después, el molino volvía a girar."
    ],
    questions=[
        mc('single_choice', '¿Cómo se narran los primeros años de Clara en la ciudad?',
           ['Con un resumen rápido que abarca mucho tiempo en pocas líneas', 'Minuto a minuto',
            'Con diálogos extensos', 'Con un salto al futuro'],
           'En pocas frases se cuentan años enteros: el ritmo es acelerado.'),
        mc('single_choice', '¿Qué ocurre con el ritmo la tarde del 3 de mayo?',
           ['Se ralentiza para detallar cada gesto de Clara', 'Se acelera todavía más',
            'Desaparece el narrador', 'Se cuenta en verso'],
           'Cada acción se narra por separado: el tiempo del relato casi coincide con el de la historia.'),
        mc('single_choice', '¿Qué técnica aparece en «Diez años después, el molino volvía a girar»?',
           ['Una elipsis', 'Una analepsis', 'Un monólogo', 'Una acotación'],
           'Se omite todo lo ocurrido durante diez años.'),
    ],
    vocab=[('imprenta', 'Taller donde se imprimen textos'), ('delantal', 'Prenda que protege la ropa al trabajar')],
    events=[
        'Clara se muda a la ciudad y trabaja en una imprenta.',
        'Lee que el molino de su padre ardió.',
        'Deja el delantal y se marcha.',
        'El molino vuelve a girar.',
    ],
)

# ── Unidad 17 — Hechos, opiniones y argumentos ──────────────────────────────

READINGS[(17, 1)] = reading(
    title='¿Por qué leer clásicos?',
    pages=[
        "Hay quien piensa que los clásicos son libros viejos que ya no tienen nada que decirnos. Yo sostengo lo contrario: leer clásicos es una de las mejores formas de entender el presente.\n"
        "En primer lugar, los clásicos tratan temas que no caducan. La ambición, los celos o el deseo de libertad movían a los personajes de hace cuatro siglos igual que nos mueven hoy.\n"
        "En segundo lugar, nos ofrecen un lenguaje rico y variado. Quien lee a Cervantes o a Bécquer amplía su vocabulario y aprende a expresar ideas con precisión.\n"
        "Por último, leer clásicos nos conecta con otras personas: son libros que han leído millones de lectores antes que nosotros, y seguirán leyéndose después.\n"
        "Es cierto que algunos resultan difíciles al principio. Pero, como toda montaña, la vista desde arriba compensa la subida."
    ],
    questions=[
        mc('single_choice', '¿Cuál es la tesis del texto?',
           ['Leer clásicos ayuda a entender el presente', 'Los clásicos son libros viejos',
            'Cervantes escribió muchos libros', 'Las montañas son difíciles de subir'],
           'El autor la anuncia con «Yo sostengo lo contrario».'),
        mc('single_choice', '¿Qué función cumple «Es cierto que algunos resultan difíciles al principio»?',
           ['Reconoce un contraargumento para luego rebatirlo', 'Es la tesis principal',
            'Es un dato estadístico', 'Es la introducción'],
           'Admite una objeción y la responde con la imagen de la montaña.'),
        mc('single_choice', '¿Qué conectores ordenan los argumentos?',
           ['«En primer lugar», «En segundo lugar», «Por último»', '«Había una vez», «Colorín colorado»',
            '«Sin embargo», «Aunque»', '«Ayer», «Mañana»'],
           'Son conectores de orden que estructuran la argumentación.'),
    ],
    vocab=[('caducan', 'Pierden vigencia o validez'), ('compensa', 'Hace que valga la pena')],
)

READINGS[(17, 2)] = reading(
    title='La reunión del club de lectura',
    pages=[
        "En la reunión del club de lectura se discutía qué libro leer el próximo mes.\n"
        "—Propongo «La isla del tesoro» —dijo Elisa—. Es una aventura clásica y muy entretenida.\n"
        "—¡Imposible! —saltó Rodrigo—. Si leemos piratas, después querrán leer solo cómics y el club desaparecerá.\n"
        "—Además —añadió Marcos—, ¿qué sabrá Elisa de libros, si llega tarde a todas las reuniones?\n"
        "—Yo voto por el libro de moda —dijo Carla—. Todo el mundo lo está leyendo, así que tiene que ser bueno.\n"
        "Don Ernesto, el coordinador, suspiró.\n"
        "—Acabamos de escuchar tres trampas del razonamiento. Busquemos argumentos, no atajos."
    ],
    questions=[
        mc('single_choice', '¿Qué falacia comete Marcos?',
           ['Ataca a la persona en lugar de a su propuesta', 'Exagera las consecuencias',
            'Apela a lo que hace la mayoría', 'Ninguna: su argumento es válido'],
           'Critica que Elisa llegue tarde, algo que nada tiene que ver con el libro: es un ataque personal.'),
        mc('single_choice', '¿Qué falacia comete Carla?',
           ['Apela a la mayoría: algo es bueno porque muchos lo hacen', 'Ataca a la persona',
            'Da un dato comprobable', 'Hace una pregunta retórica'],
           'Que muchos lo lean no demuestra que sea bueno.'),
        mc('single_choice', '¿Qué hace Rodrigo?',
           ['Exagera una cadena de consecuencias improbables', 'Da un argumento bien fundamentado',
            'Ataca a Elisa por llegar tarde', 'Cita a un experto'],
           'Supone que leer piratas llevará a la desaparición del club: es una «pendiente resbaladiza».'),
    ],
    vocab=[('coordinador', 'Persona que organiza y dirige un grupo'), ('atajos', 'Caminos más cortos; aquí, soluciones fáciles y engañosas')],
)

READINGS[(17, 4)] = reading(
    title='Reseña: «El guardián de las mareas»',
    pages=[
        "«El guardián de las mareas», de Irene Solís (novela imaginaria)\n"
        "En su primera novela, Irene Solís cuenta la historia de Bruno, un niño que hereda el oficio de su abuelo: anotar cada día la altura de las mareas en un pequeño puerto del sur. Lo que empieza como una tarea aburrida se convierte en una investigación cuando las mareas empiezan a comportarse de forma extraña.\n"
        "La autora maneja con habilidad el suspenso y retrata con ternura la relación entre abuelo y nieto. Sus descripciones del mar son precisas y poéticas, aunque en algunos capítulos centrales el ritmo decae y la trama se vuelve repetitiva.\n"
        "Pese a ello, el desenlace compensa la espera: sorprendente y emotivo. Una lectura recomendable para quienes disfrutan de los misterios pequeños, esos que caben en un cuaderno de apuntes."
    ],
    questions=[
        mc('single_choice', '¿Qué partes tiene esta reseña?',
           ['Presentación, resumen, valoración y recomendación', 'Solo un resumen del argumento',
            'Una lista de personajes', 'Una biografía de la autora'],
           'Una reseña combina información sobre la obra con una opinión fundamentada.'),
        mc('single_choice', '¿Qué aspecto negativo señala el reseñista?',
           ['El ritmo decae en algunos capítulos centrales', 'El final es aburrido',
            'Las descripciones son pobres', 'Los personajes no se relacionan'],
           'Critica que en la parte central «el ritmo decae».'),
        tf('La reseña recomienda la novela.', True,
           'Concluye que es «una lectura recomendable».'),
    ],
    vocab=[('hereda', 'Recibe algo de un familiar'), ('ternura', 'Cariño delicado y afectuoso')],
)

# ── Unidad 18 — Épocas y movimientos literarios ─────────────────────────────

READINGS[(18, 1)] = reading(
    title='El Siglo de Oro',
    pages=[
        "Entre los siglos XVI y XVII, las letras españolas vivieron un esplendor tan grande que la época recibió el nombre de Siglo de Oro.\n"
        "Miguel de Cervantes publicó en 1605 la primera parte de «Don Quijote de la Mancha», considerada por muchos la primera novela moderna. Lope de Vega renovó el teatro con cientos de comedias llenas de acción y enredos, que el público corría a ver a los corrales de comedias.\n"
        "En la poesía brillaron Garcilaso de la Vega, que trajo de Italia nuevas formas como el soneto; Luis de Góngora, de estilo complejo y deslumbrante; y Francisco de Quevedo, maestro del ingenio y la sátira.\n"
        "Ya en el siglo XVII, Pedro Calderón de la Barca escribió «La vida es sueño», un drama filosófico sobre la libertad y el destino."
    ],
    questions=[
        mc('single_choice', '¿En qué siglos se desarrolló el Siglo de Oro?',
           ['XVI y XVII', 'XVIII y XIX', 'XIV y XV', 'XIX y XX'],
           'El texto lo ubica «entre los siglos XVI y XVII».'),
        mc('single_choice', '¿Qué autor renovó el teatro con cientos de comedias?',
           ['Lope de Vega', 'Garcilaso de la Vega', 'Luis de Góngora', 'Miguel de Cervantes'],
           'Lope de Vega transformó el teatro de su época.'),
        mc('single_choice', '¿De qué trata «La vida es sueño»?',
           ['Es un drama filosófico sobre la libertad y el destino', 'Es una novela de caballerías',
            'Es un libro de sonetos amorosos', 'Es una comedia de enredos'],
           'Calderón reflexiona sobre la libertad y el destino.'),
    ],
    vocab=[('esplendor', 'Momento de mayor brillo y desarrollo'), ('sátira', 'Obra que critica burlándose')],
)

READINGS[(18, 2)] = reading(
    title='El Romanticismo',
    pages=[
        "A comienzos del siglo XIX, Europa vivió una revolución de los sentimientos: el Romanticismo. Frente a la razón y las reglas, los románticos defendieron la emoción, la libertad y la imaginación.\n"
        "Les atraían los paisajes salvajes, las ruinas, la noche y la tormenta, porque reflejaban el estado de ánimo de los personajes. Admiraban a los rebeldes, a los marginados y los amores imposibles.\n"
        "En España, José de Espronceda cantó a la libertad en «La canción del pirata». José Zorrilla escribió «Don Juan Tenorio», que todavía se representa cada año en torno al Día de Todos los Santos. Y Gustavo Adolfo Bécquer, ya a mediados de siglo, compuso sus «Rimas», poemas breves e íntimos que siguen emocionando a los lectores de hoy."
    ],
    questions=[
        mc('single_choice', '¿Qué valores defendía el Romanticismo?',
           ['La emoción, la libertad y la imaginación', 'La razón y las reglas estrictas',
            'El dinero y el comercio', 'La obediencia y el orden'],
           'Los románticos se opusieron a la razón y las reglas.'),
        mc('single_choice', '¿Por qué les atraían los paisajes salvajes y las tormentas?',
           ['Porque reflejaban el estado de ánimo de los personajes', 'Porque eran fáciles de describir',
            'Porque odiaban las ciudades', 'Porque eran científicos'],
           'La naturaleza se vuelve espejo de las emociones.'),
        mc('single_choice', '¿Qué obra de Zorrilla se representa cada año en torno al Día de Todos los Santos?',
           ['«Don Juan Tenorio»', '«La canción del pirata»', '«Rimas»', '«La vida es sueño»'],
           'Es una tradición teatral muy arraigada en España.'),
    ],
    vocab=[('marginados', 'Personas apartadas de la sociedad'), ('íntimos', 'Que expresan lo más personal')],
)

READINGS[(18, 4)] = reading(
    title='Del Realismo al Modernismo',
    pages=[
        "En la segunda mitad del siglo XIX, muchos escritores se cansaron de los excesos románticos y quisieron retratar la vida tal como era. Nació así el Realismo, con novelas llenas de detalles sobre la sociedad, las ciudades y las costumbres.\n"
        "Benito Pérez Galdós retrató el Madrid de su tiempo en decenas de novelas, y Leopoldo Alas, «Clarín», escribió «La Regenta», un retrato minucioso de una ciudad de provincias. Emilia Pardo Bazán llevó a la novela la vida del campo gallego.\n"
        "A fines de siglo surgió otra corriente, esta vez desde América: el Modernismo. Su gran figura fue el nicaragüense Rubén Darío, que en 1888 publicó en Valparaíso, Chile, su libro «Azul...». Los modernistas buscaban la belleza, la musicalidad del verso y los mundos exóticos, lejos de la realidad gris."
    ],
    questions=[
        mc('single_choice', '¿Qué buscaba el Realismo?',
           ['Retratar la vida y la sociedad tal como eran', 'Inventar mundos fantásticos',
            'Escribir solo poesía', 'Imitar a los griegos'],
           'Quería mostrar la vida «tal como era».'),
        mc('single_choice', '¿De dónde era Rubén Darío?',
           ['De Nicaragua', 'De España', 'De Chile', 'De México'],
           'El texto lo presenta como «el nicaragüense Rubén Darío», aunque publicó «Azul...» en Chile.'),
        mc('single_choice', '¿Qué valoraban los modernistas?',
           ['La belleza, la musicalidad y lo exótico', 'Los datos y las estadísticas',
            'El habla rural', 'Las reglas del teatro clásico'],
           'Buscaban belleza y musicalidad, lejos de la «realidad gris».'),
    ],
    vocab=[('minucioso', 'Que se detiene en los detalles más pequeños'), ('exóticos', 'Extraños, de lugares lejanos')],
)

# ── Unidad 19 — Grandes autores y sus obras ─────────────────────────────────

READINGS[(19, 1)] = reading(
    title='Cervantes y don Quijote',
    pages=[
        "Miguel de Cervantes tuvo una vida digna de novela. Luchó en la batalla de Lepanto, donde una herida le dejó inútil la mano izquierda, y pasó cinco años cautivo en Argel.\n"
        "Ya maduro, publicó en 1605 la primera parte de «El ingenioso hidalgo don Quijote de la Mancha». Su protagonista, Alonso Quijano, lee tantos libros de caballerías que pierde el juicio y decide hacerse caballero andante. Monta a su flaco caballo, Rocinante, y sale a los caminos acompañado de Sancho Panza, un labrador sencillo que sueña con gobernar una ínsula.\n"
        "Don Quijote ve gigantes donde hay molinos y castillos donde hay ventas, pero también defiende la justicia y la dignidad. En 1615 apareció la segunda parte, y desde entonces la novela no ha dejado de leerse en todo el mundo."
    ],
    questions=[
        mc('single_choice', '¿Por qué Alonso Quijano decide hacerse caballero andante?',
           ['Porque leyó tantos libros de caballerías que perdió el juicio', 'Porque el rey se lo ordenó',
            'Porque heredó una armadura', 'Porque Sancho lo convenció'],
           'El texto lo explica: «lee tantos libros de caballerías que pierde el juicio».'),
        mc('character_role', '¿Quién es Rocinante?',
           ['El caballo de don Quijote', 'El escudero de don Quijote', 'Un gigante', 'El dueño de la venta'],
           'Rocinante es su «flaco caballo».'),
        mc('single_choice', '¿Qué le ocurrió a Cervantes en la batalla de Lepanto?',
           ['Una herida le dejó inútil la mano izquierda', 'Perdió un ojo', 'Fue nombrado rey', 'Escribió el Quijote'],
           'La herida le inutilizó la mano izquierda.'),
    ],
    vocab=[('cautivo', 'Prisionero'), ('ínsula', 'Isla (palabra antigua)')],
    events=[
        'Cervantes lucha en Lepanto.',
        'Pasa cinco años cautivo en Argel.',
        'Publica la primera parte del Quijote.',
        'Aparece la segunda parte en 1615.',
    ],
)

READINGS[(19, 2)] = reading(
    title='Dos Nobel chilenos',
    pages=[
        "América Latina ha dado al mundo voces literarias extraordinarias, y Chile tiene un lugar especial en esa historia.\n"
        "Gabriela Mistral, nacida en Vicuña en 1889, fue maestra rural antes de ser poeta. En 1945 se convirtió en la primera persona de América Latina en recibir el Premio Nobel de Literatura. Sus poemas hablan de la infancia, la maternidad y el paisaje del valle de Elqui.\n"
        "Pablo Neruda, nacido en Parral en 1904, publicó muy joven «Veinte poemas de amor y una canción desesperada», uno de los libros de poesía más leídos en español. Más tarde escribió el «Canto general», un gran poema sobre la historia de América. Recibió el Nobel en 1971.\n"
        "Además de ellos, el continente ha dado autores como Sor Juana Inés de la Cruz, Rubén Darío, Horacio Quiroga o Gabriel García Márquez."
    ],
    questions=[
        mc('single_choice', '¿Qué logro histórico alcanzó Gabriela Mistral en 1945?',
           ['Fue la primera persona latinoamericana en recibir el Nobel de Literatura', 'Fundó la primera biblioteca de Chile',
            'Escribió el «Canto general»', 'Fue elegida presidenta'],
           'El texto lo destaca como un hito para América Latina.'),
        mc('single_choice', '¿Qué obra de Neruda trata sobre la historia de América?',
           ['«Canto general»', '«Veinte poemas de amor»', '«Desolación»', '«Azul...»'],
           'El «Canto general» es un gran poema sobre la historia del continente.'),
        tf('Neruda y Mistral nacieron en la misma ciudad.', False,
           'Mistral nació en Vicuña y Neruda, en Parral.'),
    ],
    vocab=[('rural', 'Del campo'), ('maternidad', 'Condición de ser madre')],
    events=[
        'Nace Gabriela Mistral en Vicuña.',
        'Nace Pablo Neruda en Parral.',
        'Mistral recibe el Premio Nobel.',
        'Neruda recibe el Premio Nobel.',
    ],
)

READINGS[(19, 4)] = reading(
    title='Clásicos universales',
    pages=[
        "Algunas obras cruzan siglos y fronteras hasta volverse patrimonio de toda la humanidad.\n"
        "La tradición atribuye a Homero, en la antigua Grecia, «La Ilíada», sobre la guerra de Troya, y «La Odisea», el largo regreso de Ulises a su isla, Ítaca. En Italia, a comienzos del siglo XIV, Dante Alighieri escribió «La Divina Comedia», un viaje imaginario por el Infierno, el Purgatorio y el Paraíso.\n"
        "En Inglaterra, William Shakespeare creó personajes inolvidables como Hamlet, el príncipe que duda, o Romeo y Julieta, los enamorados de Verona. Y en Rusia, en el siglo XIX, León Tolstói escribió «Guerra y paz», una novela monumental sobre las guerras napoleónicas.\n"
        "Leer estas obras es conversar con personas que vivieron hace cientos de años y descubrir que se hacían las mismas preguntas que nosotros."
    ],
    questions=[
        mc('single_choice', '¿Qué narra «La Odisea»?',
           ['El largo regreso de Ulises a Ítaca', 'La guerra de los Cien Años',
            'Un viaje por el Infierno', 'La historia de Romeo y Julieta'],
           'Es el viaje de regreso de Ulises a su isla.'),
        mc('single_choice', '¿Por qué lugares viaja Dante en «La Divina Comedia»?',
           ['Infierno, Purgatorio y Paraíso', 'Troya, Ítaca y Esparta', 'Verona, Londres y Moscú', 'La Mancha y Argel'],
           'Es un viaje imaginario por los tres reinos del más allá.'),
        mc('inference_prediction', '¿Qué quiere decir que leer clásicos es «conversar» con personas del pasado?',
           ['Que sus preguntas y emociones siguen siendo cercanas a las nuestras', 'Que los autores responden cartas',
            'Que hay que leerlos en voz alta', 'Que están escritos en forma de diálogo'],
           'Descubrimos que se hacían «las mismas preguntas que nosotros».'),
    ],
    vocab=[('patrimonio', 'Bien que se hereda y pertenece a todos'), ('monumental', 'Enorme, de gran importancia')],
)

# ── Unidad 20 — La gran travesía ────────────────────────────────────────────

READINGS[(20, 1)] = reading(
    title='La última función',
    pages=[
        "El circo Estrella llegó al pueblo un martes de lluvia, con tres camiones viejos y una carpa remendada. En los carteles prometía «el espectáculo más grande del mundo», aunque apenas eran cinco artistas.\n"
        "Nadie fue a la primera función. Ni a la segunda. La tercera noche, la dueña, doña Amparo, reunió a su gente bajo la carpa vacía.\n"
        "—Mañana nos vamos —dijo—. Pero esta noche actuaremos igual, como si la carpa estuviera llena.\n"
        "Y así lo hicieron. El payaso Tino tropezó con más gracia que nunca, la trapecista voló bajo las goteras y el viejo mago sacó palomas de un sombrero que ya no tenía forro.\n"
        "Lo que ninguno sabía era que, detrás de la lona, un niño los miraba por un agujero. A la mañana siguiente, cuando los camiones se alejaban, medio pueblo esperaba en la carretera para aplaudirlos."
    ],
    questions=[
        mc('inference_prediction', '¿Por qué medio pueblo salió a aplaudir al circo?',
           ['Porque el niño contó lo que había visto esa noche', 'Porque el circo regaló entradas',
            'Porque dejó de llover', 'Porque doña Amparo los obligó'],
           'Solo el niño vio la función; se infiere que la noticia corrió gracias a él.'),
        mc('single_choice', '¿Qué figura hay en «el espectáculo más grande del mundo», dicho de un circo de cinco artistas?',
           ['Hipérbole, con un toque de ironía', 'Onomatopeya', 'Personificación', 'Anáfora'],
           'Es una exageración que contrasta, con humor, con la realidad del circo.'),
        mc('single_choice', '¿Cuál es el tema central del relato?',
           ['Hacer bien el propio trabajo aunque nadie parezca mirar', 'Los peligros del trapecio',
            'La lluvia en los pueblos', 'La magia de las palomas'],
           'Actuar con entrega ante una carpa vacía termina teniendo recompensa.'),
    ],
    vocab=[('remendada', 'Arreglada con parches'), ('goteras', 'Agujeros del techo por donde cae agua')],
    events=[
        'El circo llega al pueblo un martes de lluvia.',
        'Nadie asiste a las primeras funciones.',
        'Actúan con la carpa vacía la tercera noche.',
        'Medio pueblo los aplaude en la carretera.',
    ],
)

READINGS[(20, 2)] = reading(
    title='Biblioteca',
    pages=[
        "Entre estantes de madera\nduermen mares y ciudades;\ncada libro es una puerta\nque se abre a otras edades.\n\n"
        "Hay un rey que nunca muere,\nuna niña que pregunta,\nun capitán sin su barco\ny una luna que se asusta.\n\n"
        "Yo camino entre sus lomos\ncomo quien cruza un jardín,\ny en cada página abierta\nvuelvo a empezar, sin fin."
    ],
    questions=[
        mc('single_choice', '¿Qué figura aparece en «cada libro es una puerta»?',
           ['Metáfora', 'Símil', 'Onomatopeya', 'Hipérbole'],
           'Identifica el libro con una puerta sin usar «como».'),
        mc('single_choice', '«Ciudades» y «edades» riman en…',
           ['Rima consonante', 'Rima asonante', 'No riman', 'Rima aguda'],
           'Coinciden vocales y consonantes: -ades.'),
        mc('inference_prediction', '¿Quiénes son «un rey que nunca muere» o «un capitán sin su barco»?',
           ['Personajes que viven dentro de los libros', 'Personas que visitan la biblioteca',
            'Estatuas de la biblioteca', 'Los bibliotecarios'],
           'Son personajes literarios, inmortales mientras alguien los lea.'),
    ],
    vocab=[('estantes', 'Tablas donde se colocan los libros'), ('lomos', 'Parte del libro que se ve en el estante')],
    sentence='cada libro es una puerta que se abre a otras edades',
)

READINGS[(20, 4)] = reading(
    title='Elogio de la lectura lenta',
    pages=[
        "Vivimos rodeados de textos breves: mensajes, titulares, notificaciones que leemos en segundos y olvidamos en minutos. Frente a esa prisa, propongo una defensa de la lectura lenta.\n"
        "Leer despacio no es leer poco. Es dejar que una frase nos acompañe, volver sobre un párrafo que nos conmovió, detenernos en una palabra desconocida en lugar de saltarla. Así lo hacían los lectores de otros siglos, que copiaban a mano sus fragmentos favoritos.\n"
        "Algunos dirán que no hay tiempo, que el mundo exige velocidad. Pero precisamente por eso la lectura lenta es valiosa: nos devuelve la atención, ese bien escaso que todos quieren robarnos.\n"
        "Un libro leído deprisa se parece a un paisaje visto desde un tren. Un libro leído despacio es un camino que recorremos a pie: tardamos más, pero llegamos conociendo cada piedra."
    ],
    questions=[
        mc('single_choice', '¿Cuál es la tesis del ensayo?',
           ['La lectura lenta es valiosa frente a la prisa actual', 'Hay que leer solo titulares',
            'Los trenes son mejores que caminar', 'Copiar a mano es obligatorio'],
           'El autor anuncia: «propongo una defensa de la lectura lenta».'),
        mc('single_choice', '¿Qué recurso usa el último párrafo para cerrar el argumento?',
           ['Una comparación entre el tren y el camino a pie', 'Una estadística',
            'Una cita de un experto', 'Una pregunta sin respuesta'],
           'Compara dos formas de leer con dos formas de viajar.'),
        mc('single_choice', '¿Cómo responde el autor a quienes dicen que «no hay tiempo»?',
           ['Afirma que justamente por la prisa la lectura lenta es valiosa', 'Les da la razón y abandona su tesis',
            'Los insulta', 'Cambia de tema'],
           'Reconoce el contraargumento y lo convierte en una razón a su favor.'),
    ],
    vocab=[('conmovió', 'Emocionó profundamente'), ('escaso', 'Poco abundante')],
)
