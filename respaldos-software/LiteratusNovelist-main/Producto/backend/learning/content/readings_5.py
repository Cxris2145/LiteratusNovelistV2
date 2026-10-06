"""Lecturas de las unidades 21 a 25. Textos originales del Taller Literatus."""

from .fmt import mc, reading

READINGS = {}

# ── Unidad 21 — Noticias y medios ───────────────────────────────────────────

READINGS[(21, 1)] = reading(
    title='Biblioteca abrirá de noche',
    pages=[
        "BIBLIOTECA DE PUERTO CLARO ABRIRÁ DE NOCHE\n"
        "La medida comenzará el lunes y busca atender a estudiantes que trabajan durante el día.\n"
        "Puerto Claro. La Biblioteca Municipal de Puerto Claro atenderá desde el próximo lunes hasta las once de la noche, según anunció ayer su directora, Ana Rojas. El nuevo horario busca que los estudiantes que trabajan durante el día puedan usar las salas de estudio y pedir libros en préstamo.\n"
        "La decisión se tomó después de una encuesta en la que participaron más de mil vecinos. Siete de cada diez pidieron ampliar el horario.\n"
        "Para cubrir los turnos nocturnos, la biblioteca contrató a cuatro funcionarios y sumó dos guardias. El municipio informó que el cambio no tendrá costo para los usuarios.\n"
        "La medida se evaluará al terminar el año."
    ],
    questions=[
        mc('single_choice', '¿Qué información entrega el primer párrafo de la noticia (el lead)?',
           ['Qué ocurrirá, dónde, cuándo y quién lo anunció', 'La opinión de la directora sobre la lectura',
            'La historia completa de la biblioteca', 'El sueldo de los guardias'],
           'El lead responde las preguntas básicas: qué, dónde, cuándo y quién.'),
        mc('single_choice', '¿Por qué la frase «La medida se evaluará al terminar el año» va al final?',
           ['Porque es el dato menos importante, según la pirámide invertida', 'Porque es la noticia principal',
            'Porque es una opinión del periodista', 'Porque el titular la anuncia'],
           'La pirámide invertida deja para el final los datos secundarios.'),
        mc('inference_prediction', '¿Qué dato respalda la decisión de ampliar el horario?',
           ['La encuesta en la que siete de cada diez vecinos lo pidieron', 'La contratación de dos guardias',
            'El nombre de la directora', 'Que el cambio no tendrá costo'],
           'La encuesta muestra que la mayoría de los vecinos quería el cambio.'),
    ],
    vocab=[('encuesta', 'Serie de preguntas para conocer la opinión de muchas personas'),
           ('municipio', 'Gobierno local de una comuna o ciudad')],
    sentence='Siete de cada diez pidieron ampliar el horario.',
)

READINGS[(21, 2)] = reading(
    title='La feria de los domingos',
    pages=[
        "A las seis de la mañana, cuando la ciudad todavía bosteza, la calle Prat ya es otra. Llegan los camiones cargados de lechugas, los carros de mano, las mesas plegables. A las siete se oye el primer grito: «¡A luca la palta, casera!». A las ocho, el olor a cilantro lo inunda todo.\n"
        "He venido a esta feria durante veinte años y sigo sin entender cómo cabe tanta vida en tres cuadras. Doña Elsa, que vende huevos desde 1987, me guarda siempre los más grandes. Dice que es porque le caigo bien; yo sospecho que es porque nunca regateo.\n"
        "A las dos de la tarde bajan los toldos y la calle vuelve a ser una calle. Queda un rastro de hojas de repollo y el eco de los pregones. El domingo siguiente, todo comenzará de nuevo."
    ],
    questions=[
        mc('single_choice', '¿Qué rasgo de la crónica tiene este texto?',
           ['Narra hechos en orden temporal con la mirada personal de quien escribe', 'Solo entrega datos, sin ningún punto de vista',
            'Es un poema con rima', 'Es una noticia en pirámide invertida'],
           'La crónica sigue el paso de las horas y deja ver la mirada del cronista.'),
        mc('single_choice', '¿Qué marca la presencia del cronista en el texto?',
           ['El uso de la primera persona: «He venido», «yo sospecho»', 'Las cifras de ventas',
            'Un titular en mayúsculas', 'Las acotaciones entre paréntesis'],
           'Quien escribe se incluye en el relato y opina sobre lo que ve.'),
        mc('single_choice', '¿Qué figura aparece en «cuando la ciudad todavía bosteza»?',
           ['Una personificación', 'Una hipérbole', 'Una onomatopeya', 'Un símil'],
           'Se le atribuye a la ciudad una acción humana: bostezar.'),
    ],
    vocab=[('pregones', 'Anuncios en voz alta de lo que se vende'),
           ('toldos', 'Cubiertas de tela que dan sombra')],
    events=[
        'Llegan los camiones cargados de lechugas.',
        'Se oye el primer grito de los vendedores.',
        'El olor a cilantro lo inunda todo.',
        'Bajan los toldos a las dos de la tarde.',
    ],
)

READINGS[(21, 4)] = reading(
    title='Conversación con una encuadernadora',
    pages=[
        "Marta Soto tiene setenta y dos años y lleva medio siglo devolviéndoles la vida a los libros rotos. En su taller del cerro Alegre, entre prensas y frascos de cola, conversamos con ella.\n"
        "—¿Cómo llegó a este oficio?\n"
        "—Por accidente. A los veinte años se me desarmó un diccionario y no tenía plata para otro. Un vecino me enseñó a coserlo. Nunca más paré.\n"
        "—¿Qué libro le ha costado más reparar?\n"
        "—Una Biblia de 1890 que había pasado por un incendio. Tardé cuatro meses. Cuando la familia vino a buscarla, la abuela lloró.\n"
        "—¿Los libros digitales no le quitan trabajo?\n"
        "—Al contrario. La gente ahora quiere cuidar los libros de papel que guarda, porque sabe que tienen historia.\n"
        "Antes de despedirnos, nos muestra un cuaderno de su padre que todavía no se atreve a restaurar."
    ],
    questions=[
        mc('single_choice', '¿Qué función cumple el primer párrafo?',
           ['Presenta a la entrevistada y el lugar de la conversación', 'Resume todas las respuestas',
            'Expresa la opinión del medio', 'Cierra la entrevista'],
           'La entrada de una entrevista presenta a la persona y el contexto.'),
        mc('single_choice', '¿Qué opina Marta sobre los libros digitales?',
           ['Que han hecho que la gente valore más sus libros de papel', 'Que acabarán con su oficio',
            'Que son más bonitos que los de papel', 'Que nunca los ha visto'],
           'Dice que la gente ahora quiere cuidar los libros que tienen historia.'),
        mc('inference_prediction', '¿Qué sugiere el cuaderno que no se atreve a restaurar?',
           ['Que tiene un gran valor afectivo para ella', 'Que está en perfecto estado',
            'Que no sabe cómo repararlo', 'Que pertenece a un cliente'],
           'Es de su padre: tocarlo significa tocar un recuerdo.'),
    ],
    vocab=[('oficio', 'Trabajo manual que requiere práctica'),
           ('restaurar', 'Reparar algo para devolverle su estado original')],
    events=[
        'A Marta se le desarma un diccionario.',
        'Un vecino le enseña a coserlo.',
        'Repara una Biblia dañada por un incendio.',
        'Recibe a los periodistas en su taller.',
    ],
)

# ── Unidad 22 — El relato policial ──────────────────────────────────────────

READINGS[(22, 1)] = reading(
    title='El reloj del salón',
    pages=[
        "Cuando la inspectora Lagos entró en el salón, el señor Ibáñez ya había llamado a la policía. Su colección de monedas antiguas había desaparecido de la vitrina.\n"
        "—Entraron por la ventana —dijo, señalando el vidrio roto—. Yo estaba durmiendo arriba.\n"
        "Lagos no respondió. Se agachó junto a la ventana. Los trozos de vidrio estaban sobre el jardín, afuera, no sobre la alfombra. Luego miró la vitrina: estaba abierta, pero la cerradura no tenía ni un rasguño. Por último, se fijó en el reloj de pared, detenido a las tres y diez.\n"
        "—Señor Ibáñez —dijo al fin—, el vidrio se rompió desde adentro, y quien abrió la vitrina tenía la llave. ¿Quién más tiene una copia?\n"
        "El hombre tardó demasiado en contestar."
    ],
    questions=[
        mc('single_choice', '¿Qué indica que el vidrio se rompió desde adentro?',
           ['Los trozos cayeron afuera, sobre el jardín', 'El reloj se detuvo',
            'La alfombra estaba sucia', 'Ibáñez dormía arriba'],
           'Si alguien lo hubiera roto desde afuera, los trozos habrían caído sobre la alfombra.'),
        mc('single_choice', '¿Qué deduce la inspectora de la cerradura sin rasguños?',
           ['Que la vitrina se abrió con su llave', 'Que el ladrón era muy fuerte',
            'Que la vitrina estaba vacía desde antes', 'Que nadie entró al salón'],
           'Una cerradura forzada deja marcas; esta no tenía ninguna.'),
        mc('inference_prediction', '¿Qué sugiere que Ibáñez «tardó demasiado en contestar»?',
           ['Que podría estar ocultando algo', 'Que no escuchó la pregunta',
            'Que estaba feliz', 'Que la inspectora se equivocó'],
           'Su vacilación lo vuelve sospechoso.'),
    ],
    vocab=[('vitrina', 'Mueble con vidrios para exhibir objetos'),
           ('rasguño', 'Raspón o marca leve en una superficie')],
    events=[
        'Ibáñez llama a la policía.',
        'Lagos examina los vidrios rotos.',
        'Lagos revisa la cerradura de la vitrina.',
        'Lagos pregunta quién tiene otra llave.',
    ],
)

READINGS[(22, 2)] = reading(
    title='Una coartada con lluvia',
    pages=[
        "—El martes a las nueve yo estaba en el cine —aseguró Rubén—. Vi la película completa y volví a casa caminando.\n"
        "El detective Muñoz anotó cada palabra en su libreta.\n"
        "—¿Y qué tal el paseo de vuelta?\n"
        "—Agradable. Una noche tranquila, con luna llena. Me detuve a mirarla en el puente.\n"
        "Muñoz cerró la libreta. Esa noche había llovido sin parar desde las ocho hasta la madrugada; los diarios hablaban de calles inundadas. Además, la función del martes se había suspendido por un corte de luz.\n"
        "—Su coartada tiene dos grietas, Rubén —dijo con calma—. Ni hubo función ni hubo luna. ¿Dónde estaba realmente?"
    ],
    questions=[
        mc('single_choice', '¿Qué es la coartada de Rubén?',
           ['Su explicación de que estaba en el cine a esa hora', 'El arma del delito',
            'El nombre del detective', 'La película que vio Muñoz'],
           'Una coartada intenta probar que el sospechoso estaba en otro lugar.'),
        mc('single_choice', '¿Cuáles son las dos grietas que encuentra Muñoz?',
           ['La lluvia de esa noche y la función suspendida', 'La luna y el puente',
            'La libreta y el cine', 'El corte de luz y la hora del paseo'],
           'Rubén describe una noche despejada y una película que nunca se dio.'),
        mc('inference_prediction', '¿Qué puede concluir el lector sobre Rubén?',
           ['Que mintió sobre dónde estaba', 'Que es inocente sin duda',
            'Que es astrónomo', 'Que trabaja en el cine'],
           'Su relato no coincide con los hechos comprobables.'),
    ],
    vocab=[('libreta', 'Cuaderno pequeño para tomar notas'),
           ('madrugada', 'Primeras horas del día, antes del amanecer')],
    sentence='El detective Muñoz anotó cada palabra en su libreta.',
)

READINGS[(22, 4)] = reading(
    title='Tres detectives y una lupa',
    pages=[
        "En 1841, Edgar Allan Poe publicó «Los crímenes de la calle Morgue». Su protagonista, C. Auguste Dupin, resolvía un caso imposible casi sin moverse de su sillón: le bastaba razonar. Muchos consideran ese cuento el inicio del relato policial moderno.\n"
        "Casi medio siglo después, en 1887, Arthur Conan Doyle presentó a Sherlock Holmes en «Estudio en escarlata». Holmes observaba detalles que nadie veía: el barro en unos zapatos, una mancha en una manga. Su amigo, el doctor Watson, narraba sus aventuras desde el 221B de Baker Street, en Londres.\n"
        "En 1920 apareció un detective belga, pequeño y muy ordenado: Hércules Poirot, creado por Agatha Christie. Poirot confiaba en lo que llamaba sus «pequeñas células grises».\n"
        "Los tres comparten un método: observar, reunir pistas y deducir. Por eso el lector de policiales también juega a investigar."
    ],
    questions=[
        mc('single_choice', '¿Quién narra las aventuras de Sherlock Holmes?',
           ['El doctor Watson', 'El propio Holmes', 'Agatha Christie', 'Dupin'],
           'Watson es el amigo y cronista de Holmes.'),
        mc('single_choice', '¿Qué tienen en común los tres detectives?',
           ['Resuelven los casos observando, reuniendo pistas y deduciendo', 'Son todos belgas',
            'Los creó el mismo autor', 'Usan la fuerza para atrapar al culpable'],
           'El texto lo dice: comparten un método.'),
        mc('single_choice', '¿Cuál es el más antiguo de los tres detectives?',
           ['C. Auguste Dupin', 'Sherlock Holmes', 'Hércules Poirot', 'El doctor Watson'],
           'Dupin aparece en 1841, mucho antes que Holmes (1887) y Poirot (1920).'),
    ],
    vocab=[('deducir', 'Llegar a una conclusión a partir de indicios'),
           ('método', 'Modo ordenado de hacer algo')],
    events=[
        'Poe publica el primer caso de Dupin.',
        'Conan Doyle presenta a Sherlock Holmes.',
        'Agatha Christie crea a Hércules Poirot.',
    ],
    events_explanation='Dupin aparece en 1841; Holmes, en 1887, y Poirot, en 1920.',
)

# ── Unidad 23 — Ciencia ficción ─────────────────────────────────────────────

READINGS[(23, 1)] = reading(
    title='El archivo de los sueños',
    pages=[
        "En el año 2089, dormir dejó de ser un asunto privado. La empresa Oniria inventó una diadema que grababa los sueños y los convertía en películas. Al principio fue un juego: la gente compartía sus vuelos imposibles y sus casas de chocolate.\n"
        "Pronto aparecieron los problemas. Las escuelas pedían ver los sueños de los alumnos para conocer sus miedos. Los bancos ofrecían préstamos más baratos a quienes soñaban con trabajar. Y las personas empezaron a dormir con miedo de soñar algo inadecuado.\n"
        "Lía, de quince años, fue la primera en apagar su diadema. Esa noche soñó con un mar violeta que nadie más vería jamás. Al despertar, escribió en su cuaderno: «Hay cosas que solo son libres mientras nadie las mira»."
    ],
    questions=[
        mc('single_choice', '¿Cuál es la pregunta «¿y si...?» que plantea el relato?',
           ['¿Y si los sueños pudieran grabarse y compartirse?', '¿Y si no existieran las escuelas?',
            '¿Y si los bancos regalaran dinero?', '¿Y si el mar fuera violeta?'],
           'Toda la historia nace de imaginar una diadema que graba los sueños.'),
        mc('single_choice', '¿Qué problema muestra el relato?',
           ['La pérdida de la intimidad cuando todo puede ser vigilado', 'La falta de diademas en las tiendas',
            'Que los sueños son aburridos', 'Que Lía no sabe escribir'],
           'Escuelas y bancos usan los sueños para juzgar a las personas.'),
        mc('inference_prediction', '¿Qué significa la frase final de Lía?',
           ['Que la libertad necesita espacios privados', 'Que los cuadernos son mejores que las diademas',
            'Que nadie debería dormir', 'Que el mar no existe'],
           'Su sueño es libre precisamente porque nadie lo ve.'),
    ],
    vocab=[('diadema', 'Adorno o aparato que se coloca en la cabeza'),
           ('préstamos', 'Dinero que se entrega para devolverlo después')],
    events=[
        'Oniria inventa la diadema de los sueños.',
        'La gente comparte sus sueños como un juego.',
        'Escuelas y bancos piden ver los sueños.',
        'Lía apaga su diadema.',
    ],
)

READINGS[(23, 2)] = reading(
    title='La decisión de Orión',
    pages=[
        "Orión era un robot de rescate programado con las tres leyes que imaginó el escritor Isaac Asimov: no dañar a un ser humano ni permitir que sufra daño; obedecer las órdenes humanas, salvo que contradigan la primera ley, y proteger su propia existencia, si eso no contradice las anteriores.\n"
        "Aquella tarde, el capitán Reyes le ordenó: «Quédate en la base, la tormenta es peligrosa para tus circuitos». Pero los sensores de Orión detectaron a dos niños atrapados en el refugio del cerro.\n"
        "Orión calculó durante un segundo que le pareció muy largo. Si obedecía, los niños quedarían solos. Si salía, la tormenta podía destruirlo.\n"
        "Salió. Volvió al amanecer, con un brazo inutilizado y los dos niños envueltos en su manta térmica. El capitán no lo regañó."
    ],
    questions=[
        mc('single_choice', '¿Por qué Orión desobedece la orden del capitán?',
           ['Porque proteger a los humanos está por sobre la obediencia', 'Porque quería conocer la tormenta',
            'Porque el capitán no era humano', 'Porque se averió su programa'],
           'La primera ley manda sobre la segunda: los niños estaban en peligro.'),
        mc('single_choice', '¿Qué ley queda en último lugar en el dilema de Orión?',
           ['Proteger su propia existencia', 'No dañar a los humanos', 'Obedecer órdenes', 'Ninguna: todas valen igual'],
           'La tercera ley cede ante las otras dos: Orión arriesga su cuerpo.'),
        mc('inference_prediction', '¿Qué sugiere que «el capitán no lo regañó»?',
           ['Que entendió que Orión hizo lo correcto', 'Que no notó que había salido',
            'Que estaba enojado en secreto', 'Que Orión dejó de funcionar'],
           'El silencio del capitán reconoce el valor de la decisión.'),
    ],
    vocab=[('sensores', 'Dispositivos que detectan lo que ocurre alrededor'),
           ('circuitos', 'Caminos por donde circula la corriente eléctrica')],
    events=[
        'El capitán ordena a Orión quedarse en la base.',
        'Los sensores detectan a dos niños atrapados.',
        'Orión sale hacia la tormenta.',
        'Orión vuelve con los niños al amanecer.',
    ],
)

READINGS[(23, 4)] = reading(
    title='Mundos perfectos y mundos de advertencia',
    pages=[
        "En 1516, el inglés Tomás Moro publicó «Utopía», un libro que describía una isla imaginaria donde todos vivían en armonía. La palabra que inventó, formada a partir del griego, puede entenderse como «lugar que no existe». Desde entonces, llamamos utopía a una sociedad ideal.\n"
        "En el siglo XX, muchos escritores hicieron el camino contrario: imaginaron sociedades que parecían perfectas, pero escondían algo terrible. En «Un mundo feliz» (1932), de Aldous Huxley, la gente es feliz porque no piensa. En «1984» (1949), de George Orwell, un Gran Hermano vigila cada movimiento. En «Fahrenheit 451» (1953), de Ray Bradbury, los bomberos queman libros.\n"
        "Estas obras se llaman distopías. No intentan adivinar el futuro: advierten sobre los peligros del presente."
    ],
    questions=[
        mc('single_choice', '¿Qué es una distopía según el texto?',
           ['Una sociedad imaginada que parece perfecta, pero esconde algo terrible',
            'Una isla donde todos son felices de verdad', 'Un libro de historia', 'Un tipo de robot'],
           'Las distopías muestran el lado oscuro de los mundos «perfectos».'),
        mc('single_choice', '¿Cuál es el propósito de las distopías, según el texto?',
           ['Advertir sobre peligros del presente', 'Adivinar con exactitud el futuro',
            'Enseñar a apagar incendios', 'Describir lugares reales'],
           'El texto lo dice en su última oración.'),
        mc('single_choice', '¿Qué obra presenta a un Gran Hermano que lo vigila todo?',
           ['«1984», de George Orwell', '«Utopía», de Tomás Moro',
            '«Fahrenheit 451», de Ray Bradbury', '«Un mundo feliz», de Aldous Huxley'],
           'El Gran Hermano es el vigilante omnipresente de «1984».'),
    ],
    vocab=[('armonía', 'Convivencia en paz y equilibrio'),
           ('advierten', 'Avisan de un peligro')],
    events=[
        'Tomás Moro publica «Utopía».',
        'Aldous Huxley publica «Un mundo feliz».',
        'George Orwell publica «1984».',
        'Ray Bradbury publica «Fahrenheit 451».',
    ],
    events_explanation='Las fechas del texto lo indican: 1516, 1932, 1949 y 1953.',
)

# ── Unidad 24 — Humor, ironía y parodia ─────────────────────────────────────

READINGS[(24, 1)] = reading(
    title='El día perfecto de Bruno',
    pages=[
        "Bruno se levantó convencido de que sería un día perfecto. El despertador no sonó, así que llegó tarde a la prueba de matemáticas. «Excelente comienzo», pensó, mientras buscaba un lápiz que no tenía.\n"
        "En el recreo, una paloma eligió precisamente su cabeza para descansar. «Qué honor», murmuró, limpiándose con una hoja del cuaderno de historia. Al mediodía descubrió que su almuerzo se había quedado en la mesa de la cocina. Su estómago rugía como un león ofendido.\n"
        "De regreso a casa empezó a llover, justo el día en que había decidido no llevar paraguas porque el cielo estaba «clarísimo».\n"
        "Cuando su madre le preguntó cómo le había ido, Bruno sonrió:\n"
        "—Maravilloso. No podría haber sido mejor."
    ],
    questions=[
        mc('single_choice', '¿Qué recurso usa Bruno al decir «Maravilloso. No podría haber sido mejor»?',
           ['La ironía: dice lo contrario de lo que piensa', 'Una comparación',
            'Una descripción objetiva', 'Una onomatopeya'],
           'Después de un día desastroso, sus palabras significan lo opuesto.'),
        mc('single_choice', '¿Qué figura aparece en «Su estómago rugía como un león ofendido»?',
           ['Un símil con efecto humorístico', 'Una ironía', 'Una paradoja', 'Una moraleja'],
           'Compara el ruido del estómago con el rugido de un león, usando «como».'),
        mc('inference_prediction', '¿Cómo descubre el lector que Bruno habla con ironía?',
           ['Por el contraste entre sus palabras y lo que le ocurrió', 'Porque lo dice el título',
            'Porque su madre se ríe', 'Porque usa signos de exclamación'],
           'La ironía se entiende gracias al contexto.'),
    ],
    vocab=[('convencido', 'Seguro de algo'),
           ('murmuró', 'Habló en voz muy baja')],
    events=[
        'El despertador de Bruno no suena.',
        'Una paloma se posa en su cabeza.',
        'Descubre que olvidó el almuerzo.',
        'Empieza a llover camino a casa.',
    ],
)

READINGS[(24, 2)] = reading(
    title='El concurso de los importantes',
    pages=[
        "En el pueblo de Vanagloria se celebraba cada año el Concurso de la Persona Más Importante. El alcalde abrió el acto con un discurso de dos horas sobre sí mismo. Luego habló el banquero, que mostró una foto de su caja fuerte. Después, el poeta oficial leyó un soneto dedicado a su propio bigote.\n"
        "El jurado, formado por los mismos concursantes, deliberó con gran seriedad. Tras mucho debate, decidió que todos merecían el primer lugar.\n"
        "Mientras tanto, a la orilla del río, el viejo Anselmo terminaba de reparar el puente que todos habían cruzado para llegar al concurso. Nadie lo invitó. Nadie notó que el puente ya no crujía.\n"
        "Esa noche, el puente resistió el paso de todos los importantes. Ninguno se preguntó por qué."
    ],
    questions=[
        mc('single_choice', '¿Qué defecto critica esta sátira?',
           ['La vanidad de quienes se creen importantes', 'La pereza de los niños',
            'La falta de puentes', 'El exceso de lluvia'],
           'Cada concursante solo habla de sí mismo.'),
        mc('single_choice', '¿Qué efecto tiene que el jurado esté formado por los propios concursantes?',
           ['Ridiculiza un concurso injusto y egoísta', 'Hace el concurso más justo',
            'Demuestra que Anselmo ganó', 'Explica cómo se construye un puente'],
           'Nadie puede ser juez de sí mismo: el absurdo provoca la risa y la crítica.'),
        mc('inference_prediction', '¿Qué contraste plantea el personaje de Anselmo?',
           ['Él hace algo útil sin buscar reconocimiento', 'Él es el más vanidoso de todos',
            'Él organiza el concurso', 'Él escribe el soneto'],
           'El verdadero importante trabaja en silencio, lejos del concurso.'),
    ],
    vocab=[('deliberó', 'Discutió con cuidado antes de decidir'),
           ('crujía', 'Hacía ruido al moverse o al quebrarse')],
    events=[
        'El alcalde da un discurso sobre sí mismo.',
        'El banquero muestra una foto de su caja fuerte.',
        'El poeta lee un soneto a su bigote.',
        'El jurado decide que todos merecen ganar.',
    ],
)

READINGS[(24, 4)] = reading(
    title='Imitar para reír',
    pages=[
        "Una parodia imita una obra, un estilo o un género para burlarse de él. Para disfrutarla, el lector necesita reconocer lo que se imita.\n"
        "El ejemplo más famoso de nuestra lengua es «Don Quijote de la Mancha». En el prólogo de la primera parte (1605), Cervantes declara que su intención es derribar la autoridad de los libros de caballerías. Su protagonista, un hidalgo que ha leído demasiadas novelas de caballeros, confunde molinos con gigantes y ventas con castillos. Al reírnos de él, también nos reímos de esas novelas exageradas.\n"
        "Francisco de Quevedo, en el Barroco, llevó la burla a la poesía. Su célebre soneto que empieza «Érase un hombre a una nariz pegado» es una caricatura: exagera una nariz hasta volverla monstruosa.\n"
        "Hoy la parodia sigue viva en el cine, las series y los memes, que imitan escenas conocidas para hacer reír."
    ],
    questions=[
        mc('single_choice', '¿Qué necesita el lector para disfrutar una parodia?',
           ['Reconocer la obra o el estilo que se imita', 'Leerla en voz alta',
            'Saber latín', 'Conocer al autor en persona'],
           'Sin reconocer el modelo, la burla pasa inadvertida.'),
        mc('single_choice', '¿De qué se burla el Quijote?',
           ['De los libros de caballerías', 'De las novelas policiales',
            'De los poemas de amor modernos', 'De las noticias del periódico'],
           'Cervantes lo declara en el prólogo de 1605.'),
        mc('single_choice', '¿Qué recurso domina en el soneto de Quevedo sobre la nariz?',
           ['La hipérbole con fin burlesco', 'La ironía triste', 'La analepsis', 'La rima libre'],
           'Exagera la nariz hasta volverla monstruosa.'),
    ],
    vocab=[('hidalgo', 'Noble de la categoría más baja en la España antigua'),
           ('derribar', 'Echar abajo, hacer caer')],
)

# ── Unidad 25 — Realismo mágico y el Boom ───────────────────────────────────

READINGS[(25, 1)] = reading(
    title='El abuelo que flotaba',
    pages=[
        "En la casa de los Valdivia nadie se sorprendió cuando el abuelo Ernesto empezó a flotar. Ocurrió un martes, después del almuerzo, mientras contaba por enésima vez cómo había conocido a la abuela. A medida que el recuerdo se volvía más dulce, sus pies se despegaban del suelo, hasta que quedó suspendido a medio metro de la silla.\n"
        "—Otra vez se puso contento —comentó la tía Rosa, y siguió pelando arvejas.\n"
        "Desde ese día, la familia lo amarraba con una cinta azul a la pata de la mesa, para que no se fuera por la ventana en los días felices. Los vecinos venían a pedirle que contara chistes en los cumpleaños, porque nada animaba tanto una fiesta como ver al abuelo rozando el techo.\n"
        "Solo una vez la cinta se soltó. Fue el día en que nació su primera bisnieta."
    ],
    questions=[
        mc('single_choice', '¿Qué rasgo del realismo mágico aparece en el relato?',
           ['Un hecho extraordinario se cuenta como algo natural', 'Todo se explica con argumentos científicos',
            'Los personajes huyen aterrados', 'Ocurre en otro planeta'],
           'La tía Rosa sigue pelando arvejas: a nadie le asombra que el abuelo flote.'),
        mc('single_choice', '¿Qué hace flotar al abuelo?',
           ['La felicidad de sus recuerdos', 'Un globo de helio', 'Una máquina', 'El viento'],
           'Mientras más dulce el recuerdo, más se eleva.'),
        mc('inference_prediction', '¿Qué sugiere la última oración?',
           ['Que el nacimiento de la bisnieta lo hizo inmensamente feliz', 'Que la cinta era de mala calidad',
            'Que el abuelo se perdió para siempre', 'Que la familia dejó de quererlo'],
           'Fue tan feliz que ninguna cinta pudo sujetarlo.'),
    ],
    vocab=[('suspendido', 'Detenido en el aire, sin apoyo'),
           ('arvejas', 'Semillas verdes y redondas que se comen')],
    events=[
        'El abuelo empieza a flotar después del almuerzo.',
        'La familia lo amarra con una cinta azul.',
        'Los vecinos lo invitan a los cumpleaños.',
        'La cinta se suelta cuando nace su bisnieta.',
    ],
)

READINGS[(25, 2)] = reading(
    title='Los pueblos que no están en el mapa',
    pages=[
        "Algunos de los lugares más famosos de la literatura latinoamericana no aparecen en ningún mapa. Macondo, el pueblo de «Cien años de soledad» (1967), nació de la imaginación del colombiano Gabriel García Márquez, que se inspiró en Aracataca, el pueblo donde pasó su infancia.\n"
        "Años antes, en 1955, el mexicano Juan Rulfo había creado Comala en «Pedro Páramo»: un pueblo donde los muertos siguen murmurando sus historias. El uruguayo Juan Carlos Onetti, por su parte, inventó Santa María, una ciudad gris junto a un río, que reaparece en varias de sus novelas.\n"
        "Estos escritores admiraban al estadounidense William Faulkner, que había situado muchas de sus novelas en un condado imaginario del sur de su país.\n"
        "Un pueblo inventado le permite a un autor construir un mundo completo, con su historia, sus familias y sus fantasmas."
    ],
    questions=[
        mc('single_choice', '¿En qué pueblo real se inspiró García Márquez para crear Macondo?',
           ['Aracataca', 'Comala', 'Santa María', 'Bogotá'],
           'El texto dice que Aracataca fue el pueblo de su infancia.'),
        mc('single_choice', '¿Qué caracteriza a Comala en «Pedro Páramo»?',
           ['En ella los muertos siguen murmurando sus historias', 'Es una ciudad moderna y ruidosa',
            'Es un puerto lleno de barcos', 'Está en otro planeta'],
           'Comala es un pueblo de voces y fantasmas.'),
        mc('inference_prediction', '¿Qué ventaja le da a un autor inventar un pueblo?',
           ['Construir un mundo completo, con historia, familias y fantasmas', 'Evitar escribir diálogos',
            'Vender más mapas', 'No tener que describir lugares'],
           'El último párrafo lo explica.'),
    ],
    vocab=[('condado', 'División territorial de algunos países'),
           ('infancia', 'Etapa de la vida que va del nacimiento a la adolescencia')],
    events=[
        'Faulkner sitúa sus novelas en un condado imaginario.',
        'Rulfo publica «Pedro Páramo».',
        'García Márquez publica «Cien años de soledad».',
    ],
    events_explanation='Faulkner es anterior a los dos (por eso lo admiraban); Rulfo publicó en 1955 y García Márquez, en 1967.',
)

READINGS[(25, 4)] = reading(
    title='Una explosión de novelas',
    pages=[
        "En los años sesenta, varias novelas latinoamericanas comenzaron a leerse en todo el mundo. A ese fenómeno se le llamó «Boom», una palabra inglesa que imita el sonido de una explosión.\n"
        "Entre sus figuras principales están el argentino Julio Cortázar, autor de «Rayuela» (1963), una novela que puede leerse en más de un orden; el peruano Mario Vargas Llosa, que publicó «La ciudad y los perros» en 1963; el mexicano Carlos Fuentes, autor de «La muerte de Artemio Cruz» (1962), y el colombiano Gabriel García Márquez, con «Cien años de soledad» (1967).\n"
        "El chileno José Donoso, autor de «El obsceno pájaro de la noche», escribió incluso un libro sobre el movimiento: «Historia personal del boom» (1972).\n"
        "García Márquez recibió el Premio Nobel de Literatura en 1982, y Vargas Llosa, en 2010."
    ],
    questions=[
        mc('single_choice', '¿Por qué se llamó «Boom» a este fenómeno?',
           ['Porque la palabra imita una explosión, como la fama repentina de estas novelas',
            'Porque así se llamaba una editorial', 'Porque era el apodo de Cortázar',
            'Porque las novelas trataban de guerras'],
           'La fama de estas novelas estalló de golpe en todo el mundo.'),
        mc('single_choice', '¿Qué escritor chileno escribió un libro sobre el Boom?',
           ['José Donoso', 'Pablo Neruda', 'Vicente Huidobro', 'Gabriela Mistral'],
           'Donoso publicó «Historia personal del boom» en 1972.'),
        mc('single_choice', '¿Qué característica tiene «Rayuela»?',
           ['Puede leerse en más de un orden', 'Es un libro de poemas',
            'Es una obra de teatro', 'Se publicó en 1982'],
           'Cortázar propone distintos caminos de lectura.'),
    ],
    vocab=[('fenómeno', 'Hecho que llama la atención por su importancia'),
           ('movimiento', 'Grupo de autores u obras con rasgos comunes')],
    events=[
        'Carlos Fuentes publica «La muerte de Artemio Cruz».',
        'Cortázar publica «Rayuela».',
        'García Márquez publica «Cien años de soledad».',
        'García Márquez recibe el Premio Nobel.',
    ],
    events_explanation='Las fechas del texto lo indican: 1962, 1963, 1967 y 1982.',
)
