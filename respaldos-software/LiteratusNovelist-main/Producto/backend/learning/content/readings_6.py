"""Lecturas de las unidades 26 a 30. Textos originales del Taller Literatus."""

from .fmt import mc, reading

READINGS = {}

# ── Unidad 26 — Diarios, cartas y memorias ──────────────────────────────────

READINGS[(26, 1)] = reading(
    title='El diario de Valentina',
    pages=[
        "Lunes 4 de marzo.\n"
        "Querido diario: hoy empezó el liceo. Mi mamá me peinó como si tuviera seis años y no me atreví a decirle que no. En la sala nueva no conozco a nadie. Me senté al fondo, junto a la ventana, y fingí que leía.\n"
        "Miércoles 6 de marzo.\n"
        "Una niña de pelo corto, Javiera, me preguntó qué libro era. Le mentí: dije que era de piratas. En realidad era un libro de poemas, pero me dio vergüenza.\n"
        "Viernes 8 de marzo.\n"
        "Hoy Javiera me prestó su libro favorito. ¡Es de poemas! Nos reímos tanto que la profesora nos cambió de puesto. No importa: ya tengo con quién conversar en los recreos.\n"
        "P. D.: Mañana le cuento la verdad sobre los piratas."
    ],
    questions=[
        mc('single_choice', '¿Qué rasgos de un diario íntimo presenta el texto?',
           ['Entradas con fecha, primera persona y sentimientos personales', 'Un narrador que no participa en la historia',
            'Preguntas de un periodista', 'Acotaciones teatrales'],
           'Cada entrada lleva fecha y Valentina cuenta lo que siente.'),
        mc('single_choice', '¿Por qué Valentina mintió sobre su libro?',
           ['Porque le dio vergüenza que fuera de poemas', 'Porque no sabía leer',
            'Porque el libro era de Javiera', 'Porque la profesora se lo prohibió'],
           'Lo confiesa ella misma: le dio vergüenza.'),
        mc('inference_prediction', '¿Cómo cambia el ánimo de Valentina entre el lunes y el viernes?',
           ['De la soledad a la alegría de tener una amiga', 'De la alegría a la tristeza',
            'De la calma al miedo', 'No cambia'],
           'Empieza sola al fondo de la sala y termina riendo con Javiera.'),
    ],
    vocab=[('fingí', 'Hice como si fuera cierto algo que no lo era'),
           ('vergüenza', 'Incomodidad por temor al ridículo')],
    events=[
        'Valentina se sienta sola junto a la ventana.',
        'Javiera le pregunta por su libro.',
        'Javiera le presta su libro favorito.',
        'La profesora las cambia de puesto.',
    ],
)

READINGS[(26, 2)] = reading(
    title='Carta a Sofía',
    pages=[
        "Concepción, 12 de agosto.\n"
        "Querida Sofía:\n"
        "Recibí tu postal de Montreal. La pegué en el refrigerador, junto al dibujo que me hiciste a los cinco años, ese donde yo tenía el pelo verde. Me cuentas que allá la nieve llega hasta las rodillas; aquí llueve tanto que el patio parece una laguna, así que estamos a mano.\n"
        "No te preocupes por mí. Como bien, salgo a caminar con la señora Inés y ya aprendí a mandar mensajes con el teléfono, aunque todavía me salen en mayúsculas. Prefiero escribirte cartas: en ellas puedo tardar lo que quiera en encontrar las palabras.\n"
        "Tu limonero dio por fin sus primeros limones. Te guardo el más grande para cuando vuelvas.\n"
        "Te abraza muy fuerte,\n"
        "Tu abuela Carmen"
    ],
    questions=[
        mc('single_choice', '¿Qué partes de una carta aparecen en el texto?',
           ['Lugar y fecha, saludo, cuerpo, despedida y firma', 'Titular, bajada y lead',
            'Actos y escenas', 'Tesis y argumentos'],
           'Tiene todos los elementos de una carta personal.'),
        mc('single_choice', '¿Por qué la abuela prefiere escribir cartas?',
           ['Porque puede tomarse su tiempo para encontrar las palabras', 'Porque no tiene teléfono',
            'Porque las cartas son más baratas', 'Porque Sofía se lo pidió'],
           'Ella misma lo explica en el tercer párrafo.'),
        mc('inference_prediction', '¿Qué sugiere la frase «Te guardo el más grande para cuando vuelvas»?',
           ['Que la abuela extraña a Sofía y espera su regreso', 'Que la abuela vende limones',
            'Que Sofía no volverá nunca', 'Que el limonero está enfermo'],
           'Guardar algo para alguien es una manera de esperarlo.'),
    ],
    vocab=[('postal', 'Tarjeta con una imagen que se envía por correo'),
           ('limonero', 'Árbol que da limones')],
    sentence='Tu limonero dio por fin sus primeros limones.',
)

READINGS[(26, 4)] = reading(
    title='Contar la propia vida',
    pages=[
        "Hay escritores que convierten su propia vida en literatura. Ana Frank recibió un diario al cumplir trece años, en junio de 1942. Poco después, su familia, que era judía, tuvo que esconderse en un anexo secreto de Ámsterdam para escapar de la persecución nazi. Allí escribió durante dos años, dirigiéndose a una amiga imaginaria llamada Kitty. Su diario se publicó en 1947 y hoy se lee en todo el mundo.\n"
        "Pablo Neruda, en cambio, dedicó sus últimos años a escribir sus memorias, «Confieso que he vivido», que se publicaron en 1974, después de su muerte. En ellas recuerda su infancia lluviosa en Temuco y sus viajes por el mundo.\n"
        "Un diario se escribe mientras ocurren los hechos; unas memorias, años después, cuando el autor mira su vida desde lejos."
    ],
    questions=[
        mc('single_choice', '¿A quién dirigía Ana Frank las entradas de su diario?',
           ['A una amiga imaginaria llamada Kitty', 'A su profesora', 'A Pablo Neruda', 'A un periódico'],
           'El texto lo dice: escribía a Kitty.'),
        mc('single_choice', '¿Qué diferencia un diario de unas memorias, según el texto?',
           ['El diario se escribe mientras ocurren los hechos; las memorias, años después',
            'El diario siempre es inventado', 'Las memorias se escriben en verso', 'No hay ninguna diferencia'],
           'La última oración marca la diferencia en el tiempo de escritura.'),
        mc('single_choice', '¿Qué recuerda Neruda en sus memorias?',
           ['Su infancia lluviosa en Temuco y sus viajes', 'Su vida en Ámsterdam',
            'Su trabajo como detective', 'La construcción de un robot'],
           'Así lo resume el segundo párrafo.'),
    ],
    vocab=[('anexo', 'Construcción o espacio unido a otro principal'),
           ('persecución', 'Acoso y castigo contra un grupo de personas')],
    events=[
        'Ana Frank recibe su diario al cumplir trece años.',
        'La familia Frank se esconde en el anexo secreto.',
        'Se publica el diario de Ana Frank.',
        'Se publican las memorias de Neruda.',
    ],
)

# ── Unidad 27 — Cómic y novela gráfica ──────────────────────────────────────

READINGS[(27, 1)] = reading(
    title='Leer una página de historieta',
    pages=[
        "Una historieta cuenta mediante viñetas, recuadros que funcionan como ventanas: cada una muestra un instante. En nuestra lengua se leen igual que un texto, de izquierda a derecha y de arriba abajo.\n"
        "Imagina esta página. En la primera viñeta, una niña mira por la ventana: afuera llueve. En la segunda aparece un gato empapado en el alféizar. En la tercera, la niña abre la ventana. En la cuarta vemos solo sus manos, secando al gato con una toalla.\n"
        "Entre una viñeta y otra hay un espacio en blanco llamado calle. Allí ocurre algo que no se dibuja: el lector imagina los movimientos que unen los instantes. Por eso se dice que quien lee cómics completa la historia con su propia imaginación.\n"
        "El tamaño de las viñetas también comunica: una viñeta grande detiene la lectura y destaca un momento importante."
    ],
    questions=[
        mc('single_choice', '¿Qué es la «calle» en una historieta?',
           ['El espacio en blanco entre una viñeta y otra', 'El lugar donde ocurre la historia',
            'El globo de diálogo', 'El título de la historieta'],
           'Así lo define el tercer párrafo.'),
        mc('single_choice', '¿Qué ocurre en la calle, según el texto?',
           ['El lector imagina los movimientos que unen los instantes', 'El autor firma la historieta',
            'Se escriben los diálogos', 'Nada: es solo decoración'],
           'Lo que no se dibuja lo completa la imaginación del lector.'),
        mc('single_choice', '¿Qué comunica una viñeta grande?',
           ['Que ese momento es importante', 'Que la historia terminó',
            'Que el dibujante se equivocó', 'Que nadie habla'],
           'Una viñeta grande detiene la lectura.'),
    ],
    vocab=[('alféizar', 'Borde inferior de una ventana'),
           ('empapado', 'Completamente mojado')],
    events=[
        'La niña mira la lluvia por la ventana.',
        'Un gato empapado aparece en el alféizar.',
        'La niña abre la ventana.',
        'La niña seca al gato con una toalla.',
    ],
)

READINGS[(27, 2)] = reading(
    title='El guion de «La tormenta»',
    pages=[
        "VIÑETA 1. Un faro en lo alto de un acantilado. Noche cerrada.\n"
        "CARTELA: Isla Desolación, 1903. El farero llevaba tres días sin dormir.\n"
        "VIÑETA 2. Interior del faro. Don Lucas sube la escalera de caracol con un farol.\n"
        "GLOBO DE PENSAMIENTO, con forma de nube: Si la luz se apaga esta noche, el barco no verá las rocas.\n"
        "VIÑETA 3. Un rayo ilumina el mar. Se ve un velero a lo lejos.\n"
        "ONOMATOPEYA, en letras enormes: ¡CRAAAC!\n"
        "VIÑETA 4. Don Lucas enciende la lámpara. El haz de luz cruza el mar.\n"
        "GLOBO DE DIÁLOGO, con un rabillo que apunta a don Lucas: ¡Aquí estoy, muchachos! ¡Sigan la luz!"
    ],
    questions=[
        mc('single_choice', '¿Qué función cumple la cartela de la primera viñeta?',
           ['Entrega la voz del narrador: lugar, fecha y situación', 'Muestra lo que piensa el farero',
            'Imita el sonido del trueno', 'Es lo que grita don Lucas'],
           'La cartela es el espacio del narrador.'),
        mc('single_choice', '¿Cómo se distingue el globo de pensamiento?',
           ['Tiene forma de nube', 'Tiene letras enormes', 'Está fuera de la viñeta', 'No tiene texto'],
           'El guion lo indica: «con forma de nube».'),
        mc('single_choice', '¿Qué representa «¡CRAAAC!»?',
           ['Una onomatopeya del trueno', 'El nombre del barco', 'Un pensamiento del farero', 'Una cartela'],
           'Imita el estruendo del rayo.'),
    ],
    vocab=[('farero', 'Persona que cuida y enciende un faro'),
           ('rabillo', 'Punta del globo que señala a quien habla')],
    events=[
        'Don Lucas sube la escalera del faro.',
        'Un rayo ilumina el velero.',
        'Don Lucas enciende la lámpara.',
    ],
)

READINGS[(27, 4)] = reading(
    title='De la tira cómica a la novela gráfica',
    pages=[
        "Durante décadas, las historietas se publicaron sobre todo en diarios y revistas. En Chile, Condorito apareció en 1949, creado por el dibujante René Ríos, conocido como Pepo. En Argentina, Quino publicó entre 1964 y 1973 las tiras de Mafalda, una niña que odiaba la sopa y hacía preguntas incómodas sobre el mundo.\n"
        "Con el tiempo, algunos autores se atrevieron con historias largas y temas profundos. Art Spiegelman contó en «Maus» lo que vivió su padre durante el Holocausto, dibujando a los judíos como ratones y a los nazis como gatos. La obra recibió un premio Pulitzer especial en 1992. La iraní Marjane Satrapi narró en «Persépolis» su infancia durante la revolución en su país.\n"
        "A estas obras extensas, unitarias y de temas complejos se las llama novelas gráficas."
    ],
    questions=[
        mc('single_choice', '¿Quién creó a Condorito?',
           ['René Ríos, conocido como Pepo', 'Quino', 'Art Spiegelman', 'Marjane Satrapi'],
           'El texto lo nombra en el primer párrafo.'),
        mc('single_choice', '¿A quiénes representan los ratones en «Maus»?',
           ['A los judíos perseguidos durante el Holocausto', 'A los nazis',
            'A los niños de Irán', 'A los lectores de diarios'],
           'Spiegelman dibujó a los judíos como ratones y a los nazis como gatos.'),
        mc('single_choice', '¿Qué distingue a una novela gráfica de una tira cómica?',
           ['Es una obra extensa, unitaria y de temas complejos', 'No tiene dibujos',
            'Siempre es de humor', 'Se publica todos los días en el diario'],
           'Así la define la última oración.'),
    ],
    vocab=[('décadas', 'Periodos de diez años'),
           ('unitarias', 'Que forman una sola obra completa')],
    events=[
        'Aparece Condorito.',
        'Quino comienza a publicar Mafalda.',
        '«Maus» recibe un premio Pulitzer especial.',
    ],
    events_explanation='Las fechas del texto lo indican: 1949, 1964 y 1992.',
)

# ── Unidad 28 — Literatura y sociedad ───────────────────────────────────────

READINGS[(28, 1)] = reading(
    title='Toda obra tiene una fecha',
    pages=[
        "Ninguna obra nace en el vacío. El contexto de producción es el conjunto de circunstancias históricas, sociales y culturales en que un autor escribe. Conocerlo ayuda a entender por qué un libro dice lo que dice.\n"
        "Pensemos en «Oliver Twist», que Charles Dickens publicó por entregas entre 1837 y 1839. En esa época, Inglaterra vivía la Revolución Industrial: las ciudades crecían, las fábricas se llenaban de obreros y muchos niños pobres trabajaban o vivían en asilos. Dickens, que de niño había trabajado en una fábrica de betún, conocía ese mundo de cerca.\n"
        "También existe el contexto de recepción: el momento en que un lector lee la obra. Un estudiante de hoy puede leer «Oliver Twist» como una historia de aventuras o como una denuncia que todavía tiene sentido."
    ],
    questions=[
        mc('single_choice', '¿Qué es el contexto de producción?',
           ['Las circunstancias históricas, sociales y culturales en que se escribe una obra',
            'El lugar donde se vende un libro', 'La opinión de los lectores actuales', 'El número de páginas de una novela'],
           'Así lo define el primer párrafo.'),
        mc('single_choice', '¿Qué experiencia acercó a Dickens al tema de «Oliver Twist»?',
           ['Haber trabajado de niño en una fábrica de betún', 'Haber sido detective',
            'Haber vivido en Chile', 'Haber sido rey'],
           'Conocía de cerca la pobreza y el trabajo infantil.'),
        mc('single_choice', '¿Qué es el contexto de recepción?',
           ['El momento en que un lector lee e interpreta la obra', 'La fecha en que se imprimió',
            'El prólogo del autor', 'La biografía del editor'],
           'Cada época lee la obra con sus propios ojos.'),
    ],
    vocab=[('asilos', 'Establecimientos donde se recogía a personas pobres o sin hogar'),
           ('entregas', 'Partes de una obra publicadas por separado')],
    sentence='Ninguna obra nace en el vacío.',
)

READINGS[(28, 2)] = reading(
    title='El primer turno de Juan',
    pages=[
        "Lota, 1903. Juan tenía diez años cuando su padre lo llevó por primera vez a la mina. Bajaron en la jaula de hierro, que crujía como un barco viejo, hasta donde la luz del sol no llegaba nunca.\n"
        "Abajo, el aire era espeso y olía a carbón. Los hombres trabajaban encorvados, con lámparas que apenas iluminaban sus manos. Nadie hablaba mucho: el golpe de los picos llenaba el silencio.\n"
        "A Juan le entregaron un balde para sacar el agua que se filtraba en las galerías. Debía hacerlo durante doce horas, con los pies hundidos en el barro.\n"
        "—Es trabajo de hombre —le dijo su padre, sin mirarlo a los ojos.\n"
        "Esa noche, en la casa, Juan no quiso cenar. Su madre lo abrazó sin decir nada. Afuera, el mar golpeaba la costa, indiferente."
    ],
    questions=[
        mc('single_choice', '¿Qué injusticia denuncia el relato?',
           ['El trabajo infantil en condiciones duras y peligrosas', 'La falta de barcos en Lota',
            'El precio del carbón', 'La comida de la casa'],
           'Un niño de diez años trabaja doce horas bajo tierra.'),
        mc('inference_prediction', '¿Qué sugiere que el padre hable «sin mirarlo a los ojos»?',
           ['Que le duele llevar a su hijo a la mina', 'Que está enojado con Juan',
            'Que no ve bien en la oscuridad', 'Que está orgulloso y feliz'],
           'Evita su mirada porque sabe que es injusto.'),
        mc('single_choice', '¿Qué efecto tiene la frase final «el mar golpeaba la costa, indiferente»?',
           ['Muestra que el mundo sigue igual ante el sufrimiento de la familia', 'Anuncia una tormenta que destruye la casa',
            'Explica cómo se extrae el carbón', 'Indica que Juan se irá en barco'],
           'La naturaleza no se conmueve: la familia está sola con su dolor.'),
    ],
    vocab=[('encorvados', 'Doblados hacia adelante'),
           ('galerías', 'Pasillos subterráneos de una mina')],
    events=[
        'Juan baja a la mina con su padre.',
        'Le entregan un balde para sacar el agua.',
        'El padre le dice que es trabajo de hombre.',
        'Juan no quiere cenar esa noche.',
    ],
)

READINGS[(28, 4)] = reading(
    title='Escribir para cambiar las cosas',
    pages=[
        "Algunos escritores usan la literatura para mostrar injusticias que la sociedad prefiere no ver. A esa intención se la llama denuncia social.\n"
        "En Chile, Baldomero Lillo publicó en 1904 «Sub terra», un libro de cuentos sobre los mineros del carbón de Lota. Lillo conocía de cerca ese mundo y lo retrató con crudeza: jornadas agotadoras, accidentes y niños trabajando bajo tierra.\n"
        "En Estados Unidos, Harriet Beecher Stowe publicó en 1852 «La cabaña del tío Tom», una novela contra la esclavitud que conmovió a miles de lectores. Casi un siglo después, en 1939, John Steinbeck retrató en «Las uvas de la ira» a las familias de campesinos que migraban en busca de trabajo durante la Gran Depresión.\n"
        "Estas obras no son panfletos: cuentan historias de personas concretas, y por eso logran que el lector sienta la injusticia en carne propia."
    ],
    questions=[
        mc('single_choice', '¿Qué es la denuncia social en la literatura?',
           ['Mostrar injusticias para que la sociedad las vea', 'Escribir solo historias de humor',
            'Contar la vida de los reyes', 'Describir paisajes sin personas'],
           'Así lo explica el primer párrafo.'),
        mc('single_choice', '¿Sobre quiénes escribió Baldomero Lillo en «Sub terra»?',
           ['Sobre los mineros del carbón de Lota', 'Sobre los esclavos de Estados Unidos',
            'Sobre los campesinos de la Gran Depresión', 'Sobre los detectives de Londres'],
           'Lillo conocía de cerca la vida en las minas de Lota.'),
        mc('inference_prediction', '¿Por qué estas obras conmueven al lector, según el texto?',
           ['Porque cuentan historias de personas concretas', 'Porque son muy breves',
            'Porque usan solo datos estadísticos', 'Porque tienen finales felices'],
           'Las historias personales hacen sentir la injusticia.'),
    ],
    vocab=[('crudeza', 'Manera directa de mostrar algo duro, sin suavizarlo'),
           ('panfletos', 'Escritos de propaganda, agresivos y simplistas')],
    events=[
        'Stowe publica «La cabaña del tío Tom».',
        'Lillo publica «Sub terra».',
        'Steinbeck publica «Las uvas de la ira».',
    ],
    events_explanation='Las fechas del texto lo indican: 1852, 1904 y 1939.',
)

# ── Unidad 29 — El taller del escritor ──────────────────────────────────────

READINGS[(29, 1)] = reading(
    title='Antes de la primera línea',
    pages=[
        "Camila quería escribir un cuento para el concurso del liceo, pero cada vez que se sentaba frente a la hoja en blanco se le ocurría todo y nada a la vez. Entonces su profesor le dio un consejo: «Antes de escribir, responde tres preguntas: ¿para qué escribes?, ¿para quién?, ¿qué quieres contar?».\n"
        "Camila tomó un cuaderno y anotó: propósito, emocionar; destinatarios, estudiantes de su edad; idea, una niña que encuentra cartas antiguas en una casa vacía. Luego hizo una lista con el inicio, el conflicto y el desenlace, y eligió un narrador en primera persona.\n"
        "Cuando volvió a la hoja en blanco, ya no le dio miedo. Tenía un mapa. Escribió el borrador en una tarde y, por primera vez, supo hacia dónde iba cada párrafo."
    ],
    questions=[
        mc('single_choice', '¿Qué tres preguntas recomienda el profesor?',
           ['Para qué, para quién y qué se quiere contar', 'Cuándo, dónde y cuánto',
            'Quién ganó, quién perdió y por qué', 'Qué título, qué letra y qué color'],
           'Son las preguntas de la planificación.'),
        mc('single_choice', '¿Qué representa el «mapa» que menciona el texto?',
           ['La planificación del cuento', 'Un dibujo de la casa vacía',
            'Las cartas antiguas', 'El reglamento del concurso'],
           'Es una metáfora: el plan le muestra el camino.'),
        mc('inference_prediction', '¿Qué cambio vive Camila gracias a la planificación?',
           ['Pierde el miedo a la hoja en blanco y escribe con rumbo', 'Decide no participar en el concurso',
            'Copia un cuento de internet', 'Escribe un poema en vez de un cuento'],
           'Con un plan, sabe hacia dónde va cada párrafo.'),
    ],
    vocab=[('desenlace', 'Final de una historia, donde se resuelve el conflicto'),
           ('destinatarios', 'Personas a quienes va dirigido un texto')],
    events=[
        'Camila no sabe por dónde empezar.',
        'El profesor le da un consejo.',
        'Camila anota su plan en un cuaderno.',
        'Escribe el borrador en una tarde.',
    ],
)

READINGS[(29, 2)] = reading(
    title='Los hilos del texto',
    pages=[
        "Un texto no es una bolsa de oraciones sueltas. Para que se entienda, necesita coherencia y cohesión.\n"
        "La coherencia tiene que ver con el sentido: todas las ideas deben referirse al mismo tema y avanzar en un orden lógico. La cohesión, en cambio, tiene que ver con los hilos que unen las oraciones: los conectores y las palabras que evitan repeticiones.\n"
        "Compara estos dos fragmentos. Primero: «Los gatos duermen mucho. Los gatos cazan de noche. Los gatos son independientes». Segundo: «Los gatos duermen mucho durante el día; por eso, cazan de noche. Además, son animales muy independientes».\n"
        "En el segundo, el conector «por eso» muestra una consecuencia, «además» agrega una idea, y la palabra «gatos» no se repite porque el lector ya sabe de quién se habla."
    ],
    questions=[
        mc('single_choice', '¿Qué es la cohesión, según el texto?',
           ['Los recursos que unen las oraciones, como conectores y sustituciones', 'El tema central del texto',
            'La cantidad de párrafos', 'La opinión del autor'],
           'Son los «hilos» que unen las oraciones.'),
        mc('single_choice', '¿Qué relación expresa «por eso» en el segundo fragmento?',
           ['Consecuencia', 'Contraste', 'Adición', 'Tiempo'],
           'Cazan de noche como consecuencia de dormir de día.'),
        mc('inference_prediction', '¿Por qué el segundo fragmento se lee mejor?',
           ['Porque usa conectores y evita repetir «gatos»', 'Porque es más corto',
            'Porque habla de perros', 'Porque no tiene puntos'],
           'Los conectores y las sustituciones le dan fluidez.'),
    ],
    vocab=[('sueltas', 'Separadas, sin unión entre sí'),
           ('repeticiones', 'Usos reiterados de una misma palabra')],
    sentence='Un texto no es una bolsa de oraciones sueltas.',
)

READINGS[(29, 4)] = reading(
    title='El borrador de Tomás',
    pages=[
        "Tomás terminó su relato a medianoche y se lo mostró a su hermana mayor, que trabaja como editora. Ella lo leyó con un lápiz rojo en la mano.\n"
        "—La historia es buena —le dijo—, pero hay que revisarla. Mira este párrafo: «El perro corrió. El perro saltó la reja. El perro llegó a la plaza». Repites tres veces «el perro». Y aquí escribiste «haber si vienes» en vez de «a ver si vienes».\n"
        "Tomás frunció el ceño.\n"
        "—¿Y eso importa? Se entiende igual.\n"
        "—Importa, porque cada error distrae al lector de tu historia. Revisar no es un castigo: es pulir.\n"
        "Esa noche, Tomás reescribió el párrafo: «El perro corrió, saltó la reja y llegó a la plaza». Lo leyó en voz alta y sonrió. Sonaba mejor."
    ],
    questions=[
        mc('single_choice', '¿Qué problema de cohesión detecta la editora?',
           ['La repetición innecesaria de «el perro»', 'La falta de personajes',
            'Un final triste', 'El exceso de diálogos'],
           'Repetir el sujeto en cada oración vuelve torpe el párrafo.'),
        mc('single_choice', '¿Qué error ortográfico corrige?',
           ['«Haber si vienes» en lugar de «a ver si vienes»', 'Una tilde en «perro»',
            'El nombre de Tomás', 'La palabra «plaza»'],
           '«A ver» (de mirar) no es lo mismo que «haber» (verbo).'),
        mc('inference_prediction', '¿Qué quiere decir «Revisar no es un castigo: es pulir»?',
           ['Que corregir mejora el texto, como se pule una piedra', 'Que revisar es inútil',
            'Que los errores no importan', 'Que la editora está enojada'],
           'Revisar saca brillo a lo que ya está escrito.'),
    ],
    vocab=[('editora', 'Persona que revisa y prepara textos para publicarlos'),
           ('frunció', 'Arrugó la frente en señal de molestia o duda')],
    events=[
        'Tomás termina su relato a medianoche.',
        'Su hermana lo lee con un lápiz rojo.',
        'Tomás reescribe el párrafo.',
        'Lee el párrafo en voz alta y sonríe.',
    ],
)

# ── Unidad 30 — La cumbre del lector ────────────────────────────────────────

READINGS[(30, 1)] = reading(
    title='La última página',
    pages=[
        "La biblioteca del pueblo iba a cerrar. Lo anunciaron un lunes, con un papel pegado en la puerta: «Por falta de lectores». Elena, la bibliotecaria, lo leyó tres veces, como si las letras pudieran cambiar de lugar.\n"
        "Esa tarde no entró nadie. Elena recorrió los estantes acariciando los lomos, uno por uno, como quien se despide de viejos amigos. Al llegar al último pasillo encontró a un niño sentado en el suelo, con un libro abierto sobre las rodillas. No lo había visto entrar.\n"
        "—Cerramos a las seis —le dijo.\n"
        "—Me falta una página —respondió él, sin levantar la vista.\n"
        "Elena esperó. Cuando el niño terminó, cerró el libro con cuidado y preguntó:\n"
        "—¿Mañana puedo llevarme el segundo tomo?\n"
        "Elena miró el papel de la puerta. Luego tomó un lápiz y, debajo de «Por falta de lectores», escribió con letra clara: «Ya no falta»."
    ],
    questions=[
        mc('single_choice', '¿Qué conflicto plantea el inicio del cuento?',
           ['La biblioteca va a cerrar por falta de lectores', 'Un niño se pierde en el pueblo',
            'Elena pierde un libro valioso', 'Se incendia la biblioteca'],
           'El papel de la puerta anuncia el cierre.'),
        mc('single_choice', '¿Qué figura aparece en «como quien se despide de viejos amigos»?',
           ['Un símil que muestra su cariño por los libros', 'Una ironía', 'Una onomatopeya', 'Una hipérbole'],
           'Compara los libros con amigos usando «como».'),
        mc('inference_prediction', '¿Qué significa lo que Elena escribe en el papel?',
           ['Que el niño es el lector que faltaba y la biblioteca debe seguir', 'Que la biblioteca cerrará antes',
            'Que el niño robó un libro', 'Que faltan libros en los estantes'],
           '«Ya no falta» responde a «Por falta de lectores»: ahora hay uno.'),
    ],
    vocab=[('lomos', 'Parte del libro donde se unen las hojas y suele ir el título'),
           ('tomo', 'Cada uno de los libros en que se divide una obra')],
    events=[
        'Anuncian el cierre de la biblioteca.',
        'Elena recorre los estantes acariciando los lomos.',
        'Encuentra a un niño leyendo en el suelo.',
        'Elena escribe «Ya no falta» en el papel.',
    ],
)

READINGS[(30, 2)] = reading(
    title='El bibliobús de los miércoles',
    pages=[
        "Los miércoles, a las diez en punto, un bus azul se estaciona frente a la escuela rural de Los Maitenes. No trae pasajeros: trae libros. Dos mil, para ser exactos, ordenados en estantes que se mecen un poco en las curvas.\n"
        "Lo maneja don Héctor, que antes conducía camiones de fruta y ahora dice que transporta «una carga más delicada». Lo acompaña Paula, bibliotecaria, que conoce de memoria los gustos de cada lector. A Matías le guarda libros de dinosaurios; a la señora Gladys, novelas de amor con final feliz.\n"
        "Confieso que fui a escribir una nota breve y me quedé toda la mañana. Vi a una niña elegir un libro solo por el dibujo de la portada y a un abuelo pedir el mismo libro que había leído a los doce años.\n"
        "A las dos, el bus se va. Detrás deja algo que no se puede medir en cifras."
    ],
    questions=[
        mc('single_choice', '¿Qué hechos comprobables entrega la crónica?',
           ['El bus llega los miércoles a las diez y lleva dos mil libros', 'Que los libros son una carga delicada',
            'Que los dinosaurios son lo mejor', 'Que nada se puede medir'],
           'Día, hora y cantidad de libros se pueden verificar.'),
        mc('single_choice', '¿Dónde se nota la subjetividad del cronista?',
           ['En «Confieso que fui a escribir una nota breve y me quedé toda la mañana»', 'En la hora de llegada del bus',
            'En el número de libros', 'En el nombre de la escuela'],
           'El cronista se incluye en el relato y cuenta su experiencia.'),
        mc('inference_prediction', '¿Qué deja el bus, según la frase final?',
           ['El gusto por la lectura y los encuentros con los libros', 'Basura en la calle',
            'Dos mil libros regalados', 'Un horario nuevo para la escuela'],
           'Lo que deja no se mide en cifras: es una experiencia.'),
    ],
    vocab=[('rural', 'Del campo, fuera de la ciudad'),
           ('portada', 'Cubierta delantera de un libro')],
    events=[
        'El bus se estaciona frente a la escuela.',
        'Una niña elige un libro por su portada.',
        'El bus se va a las dos.',
    ],
)

READINGS[(30, 4)] = reading(
    title='Carta a quien llega a la cumbre',
    pages=[
        "Valparaíso, un día cualquiera.\n"
        "Querido lector, querida lectora:\n"
        "Si estás leyendo esto, ya recorriste un largo camino. Aprendiste a encontrar la idea principal y a sospechar de los narradores; a contar sílabas, a seguir pistas y a reírte de una buena parodia. Viajaste a pueblos que no están en ningún mapa y a futuros que ojalá nunca lleguen.\n"
        "Ahora te confieso un secreto: la cumbre no es el final. Desde aquí arriba se ven todos los libros que todavía no has abierto, y son muchos más de los que caben en una vida. Eso no es una mala noticia. Significa que nunca te vas a aburrir.\n"
        "Lleva contigo lo que aprendiste, pero sobre todo lleva la curiosidad. Un buen lector no es quien ha leído más, sino quien sigue haciéndose preguntas.\n"
        "Nos vemos entre las páginas,\n"
        "Maguito"
    ],
    questions=[
        mc('single_choice', '¿Qué tipo de texto es y qué lo demuestra?',
           ['Una carta: tiene lugar y fecha, saludo, cuerpo, despedida y firma', 'Una noticia: tiene titular y lead',
            'Una obra de teatro: tiene acotaciones', 'Un poema: tiene rima consonante'],
           'Tiene todas las partes de una carta.'),
        mc('single_choice', '¿Qué quiere decir «la cumbre no es el final»?',
           ['Que siempre quedarán libros por descubrir', 'Que La Senda tiene un error',
            'Que hay que volver a empezar desde cero', 'Que la montaña es más alta'],
           'Desde la cumbre se ven todos los libros que faltan por abrir.'),
        mc('inference_prediction', '¿Qué define a un buen lector, según la carta?',
           ['Seguir haciéndose preguntas', 'Haber leído más libros que nadie',
            'Leer muy rápido', 'Memorizar los títulos'],
           'La carta lo dice en su penúltimo párrafo.'),
    ],
    vocab=[('cumbre', 'Parte más alta de una montaña'),
           ('curiosidad', 'Deseo de saber o descubrir algo')],
    sentence='Ahora te confieso un secreto: la cumbre no es el final.',
)
