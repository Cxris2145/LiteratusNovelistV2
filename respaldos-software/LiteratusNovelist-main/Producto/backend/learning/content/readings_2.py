"""Lecturas de las unidades 6 a 10. Textos originales del Taller Literatus."""

from .fmt import mc, reading, tf

READINGS = {}

# ── Unidad 6 — Análisis crítico y literario ─────────────────────────────────

READINGS[(6, 1)] = reading(
    title='La ciudad despierta',
    pages=[
        "A las seis, la ciudad abre sus mil ojos de vidrio. Las calles, ríos de asfalto, empiezan a llenarse de un murmullo de motores. El sol, pintor madrugador, cubre de oro las azoteas.\n"
        "En la esquina, el quiosco bosteza al levantar su persiana, y el panadero, un volcán de harina, reparte panes que humean como pequeñas chimeneas.\n"
        "Los trenes, gusanos de hierro, se tragan a los viajeros y los escupen en otras estaciones. Nadie se detiene: la ciudad es un reloj con el corazón acelerado.\n"
        "Solo un viejo, sentado en su banco de siempre, mira pasar la prisa como quien mira llover."
    ],
    questions=[
        mc('single_choice', 'En «Los trenes, gusanos de hierro», ¿qué figura se usa?',
           ['Metáfora', 'Onomatopeya', 'Pregunta retórica', 'Enumeración'],
           'Identifica los trenes con gusanos por su forma alargada, sin usar «como».'),
        mc('single_choice', '¿Qué figura aparece en «el quiosco bosteza al levantar su persiana»?',
           ['Personificación', 'Hipérbole', 'Símil', 'Anáfora'],
           'Bostezar es una acción humana atribuida a un objeto.'),
        mc('single_choice', '«Panes que humean como pequeñas chimeneas» es un ejemplo de…',
           ['Símil o comparación', 'Metáfora pura', 'Personificación', 'Antítesis'],
           'Compara dos elementos usando el nexo «como».'),
    ],
    vocab=[('azoteas', 'Techos planos de los edificios'), ('murmullo', 'Ruido suave y continuo')],
)

READINGS[(6, 2)] = reading(
    title='La llave del abuelo',
    pages=[
        "Cuando el abuelo Tomás murió, a Lucía le dejó una sola cosa: una llave de hierro, grande y oxidada. No abría ninguna puerta de la casa nueva, ni el baúl, ni los cajones.\n"
        "Durante meses, Lucía la llevó colgada al cuello, preguntándose qué cerradura buscaba. Un día, ordenando fotos, encontró una imagen de la casa donde el abuelo había nacido, en un pueblo de montaña. En la puerta, enorme y oscura, se veía una cerradura antigua.\n"
        "Viajó hasta allí. La casa ya no existía: en su lugar había una escuela. Lucía se quedó mirando a los niños que salían corriendo al recreo.\n"
        "Entonces entendió que la llave no abría una puerta, sino una historia. Esa tarde volvió a su casa y, por primera vez, le preguntó a su madre por la infancia del abuelo."
    ],
    questions=[
        mc('inference_prediction', '¿Qué simboliza la llave en el relato?',
           ['El acceso a la memoria y la historia familiar', 'La riqueza del abuelo',
            'La puerta de la escuela', 'El miedo a la muerte'],
           'Lucía descubre que la llave «no abría una puerta, sino una historia».'),
        mc('single_choice', '¿Qué hace Lucía después de su descubrimiento?',
           ['Pregunta a su madre por la infancia del abuelo', 'Vende la llave',
            'Se inscribe en la escuela', 'Construye una casa nueva'],
           'Busca conocer la historia que la llave representaba.'),
        tf('Lucía encuentra la casa natal del abuelo tal como estaba en la foto.', False,
           'La casa ya no existe: en su lugar hay una escuela.'),
    ],
    vocab=[('oxidada', 'Cubierta de óxido, desgastada por el tiempo'), ('cerradura', 'Mecanismo que se abre con una llave')],
    events=[
        'Lucía hereda una llave oxidada.',
        'Encuentra la foto de la casa natal del abuelo.',
        'Viaja y descubre una escuela en su lugar.',
        'Pregunta a su madre por la infancia del abuelo.',
    ],
)

READINGS[(6, 4)] = reading(
    title='Carta a un joven lector',
    pages=[
        "Querido Mateo:\n"
        "Me dices que leer es aburrido, que los libros son largos y el mundo va rápido. Tienes razón en algo: el mundo va rápido. Precisamente por eso los libros son necesarios. Son el único lugar donde el tiempo se detiene lo suficiente para que pensemos.\n"
        "Yo tenía tu edad cuando leí mi primera novela entera. No recuerdo el argumento, pero recuerdo la sensación: la de haber vivido otra vida sin salir de mi cuarto. Desde entonces he viajado a mares que no existen y he tenido amigos que nunca nacieron. No me arrepiento de ninguno.\n"
        "No te pido que leas todo. Te pido que encuentres un libro, uno solo, que te hable a ti. Cuando lo encuentres, sabrás de qué te hablo.\n"
        "Con cariño, tu abuela Rosa."
    ],
    questions=[
        mc('single_choice', '¿Cuál es el tono predominante de la carta?',
           ['Afectuoso y persuasivo', 'Irónico y burlón', 'Enojado y severo', 'Indiferente y frío'],
           'La abuela escribe con cariño e intenta convencer a Mateo sin regañarlo.'),
        mc('single_choice', 'Según la abuela, ¿por qué son necesarios los libros?',
           ['Porque detienen el tiempo para que podamos pensar', 'Porque son más rápidos que el mundo',
            'Porque siempre son cortos', 'Porque enseñan geografía real'],
           'Lo afirma: son «el único lugar donde el tiempo se detiene».'),
        mc('inference_prediction', '¿Qué quiere decir con «amigos que nunca nacieron»?',
           ['Personajes de libros que sintió cercanos', 'Amigos imaginarios de su infancia',
            'Vecinos que se mudaron', 'Personas que conoció en sus viajes'],
           'Se refiere a personajes de ficción: no existen, pero los vivió como amigos.'),
    ],
    vocab=[('argumento', 'Conjunto de hechos que se narran en una obra'), ('arrepiento', 'Siento pesar por algo que hice')],
)

# ── Unidad 7 — Géneros literarios ───────────────────────────────────────────

READINGS[(7, 1)] = reading(
    title='El viaje de Tomás',
    pages=[
        "Tomás nunca había salido de su aldea. Un día, su madre le pidió que llevara una carta urgente a la ciudad, a tres días de camino.\n"
        "El primer día cruzó un bosque tan espeso que la luz apenas llegaba al suelo. El segundo, un arriero le enseñó a orientarse por las estrellas. El tercero, al subir la última colina, vio por fin las torres de la ciudad, brillando como si fueran de cobre.\n"
        "Entregó la carta en la casa indicada. Una anciana la leyó y lloró de alegría: era de su hermana, a quien no veía desde hacía treinta años.\n"
        "Tomás volvió a la aldea una semana después. Todos notaron que caminaba distinto, más erguido. Él no sabía explicarlo, pero sentía que el mundo se había vuelto más grande, y él también."
    ],
    questions=[
        mc('single_choice', '¿Qué rasgo del género narrativo está presente en el texto?',
           ['Un narrador que cuenta hechos ocurridos a unos personajes', 'Versos con rima',
            'Acotaciones entre paréntesis', 'Un hablante que expresa emociones sin contar una historia'],
           'El género narrativo cuenta una historia a través de un narrador.'),
        mc('single_choice', '¿Por qué lloró la anciana?',
           ['Porque la carta era de su hermana, a quien no veía hacía treinta años', 'Porque Tomás llegó tarde',
            'Porque la carta traía malas noticias', 'Porque se había perdido en el bosque'],
           'El texto dice que lloró «de alegría» al leer a su hermana.'),
        mc('inference_prediction', '¿Qué cambio vive Tomás tras el viaje?',
           ['Gana confianza y una visión más amplia del mundo', 'Se vuelve más temeroso',
            'Olvida su aldea', 'Decide vivir en la ciudad'],
           'Camina «más erguido» y siente que el mundo, y él mismo, se hicieron más grandes.'),
    ],
    vocab=[('arriero', 'Persona que conduce animales de carga'), ('erguido', 'Derecho, con la cabeza en alto')],
    events=[
        'La madre le pide llevar una carta urgente.',
        'Un arriero le enseña a orientarse por las estrellas.',
        'Tomás entrega la carta a la anciana.',
        'Tomás vuelve a la aldea más erguido.',
    ],
)

READINGS[(7, 2)] = reading(
    title='Canción del río',
    pages=[
        "Voy bajando de la sierra\ncon un rumor de cristal;\nllevo la voz de la tierra\nhasta la orilla del mar.\n\n"
        "No me detengo en la piedra,\nno me asusta el temporal:\nquien nace para ser río\nno aprende a quedarse atrás.\n\n"
        "Y si un día, allá en la playa,\nme pierdo en la inmensidad,\nseré ola, seré nube,\nseré lluvia una vez más."
    ],
    questions=[
        mc('single_choice', '¿Quién habla en el poema (el hablante lírico)?',
           ['El río', 'La sierra', 'Un pescador', 'La lluvia'],
           'El río habla en primera persona: «Voy bajando de la sierra».'),
        mc('single_choice', '¿Qué rasgo del género lírico se observa?',
           ['Está escrito en verso y expresa una visión emotiva', 'Tiene acotaciones para actores',
            'Cuenta una historia con muchos personajes', 'Presenta argumentos y datos'],
           'La lírica usa el verso para expresar sentimientos y visiones personales.'),
        mc('inference_prediction', '¿Qué idea transmite la última estrofa?',
           ['Que nada se pierde del todo: el agua vuelve a empezar su ciclo', 'Que el río desaparece para siempre',
            'Que el mar es peligroso', 'Que la sierra es el final del camino'],
           'El río se transforma en ola, nube y lluvia: una imagen del ciclo y la renovación.'),
    ],
    vocab=[('temporal', 'Tormenta fuerte de lluvia y viento'), ('inmensidad', 'Extensión enorme, sin límites')],
    sentence='quien nace para ser río no aprende a quedarse atrás',
)

READINGS[(7, 4)] = reading(
    title='La visita',
    pages=[
        "(Una cocina humilde. Es de noche. ROSA pela papas junto a la mesa. Se oye un golpe en la puerta.)\n"
        "ROSA.— ¿Quién llama a estas horas?\n"
        "VOZ.— (Desde afuera.) Un viajero, señora. Me sorprendió la lluvia.\n"
        "ROSA.— (Duda. Se acerca a la puerta sin abrir.) ¿Y cómo sé que es usted de fiar?\n"
        "VOZ.— No lo sabe. Pero yo tampoco sé si usted lo es, y aquí estoy, llamando.\n"
        "ROSA.— (Sonríe, a su pesar, y abre.) Pase. Pero se sienta donde yo le diga.\n"
        "(Entra el VIAJERO, empapado. Se quita el sombrero. Rosa lo mira y deja caer el cuchillo.)\n"
        "ROSA.— ¡Andrés! ¡Hijo!\n"
        "(Oscuro.)"
    ],
    questions=[
        mc('single_choice', '¿Para qué sirven los textos entre paréntesis?',
           ['Indican lugar, gestos y movimientos: son acotaciones', 'Son pensamientos que el público no debe oír',
            'Son errores del autor', 'Son títulos de escenas'],
           'Las acotaciones orientan a actores y directores sobre cómo representar la obra.'),
        mc('inference_prediction', '¿Por qué Rosa deja caer el cuchillo?',
           ['Porque reconoce en el viajero a su hijo Andrés', 'Porque el viajero la amenaza',
            'Porque se cortó un dedo', 'Porque se apagó la luz'],
           'Su exclamación «¡Andrés! ¡Hijo!» revela la sorpresa del reencuentro.'),
        tf('El texto pertenece al género dramático.', True,
           'Está escrito en diálogo, con nombres de personajes y acotaciones, para ser representado.'),
    ],
    vocab=[('empapado', 'Completamente mojado'), ('humilde', 'Sencillo, pobre')],
    events=[
        'Rosa escucha un golpe en la puerta.',
        'La voz se presenta como un viajero.',
        'Rosa abre y deja entrar al viajero.',
        'Rosa reconoce a su hijo Andrés.',
    ],
)

# ── Unidad 8 — Figuras retóricas ────────────────────────────────────────────

READINGS[(8, 1)] = reading(
    title='La abuela y el mar',
    pages=[
        "Mi abuela tenía las manos como raíces de olivo: nudosas, fuertes, llenas de historias. Cada verano me llevaba a la playa y me enseñaba a leer el mar.\n"
        "—El mar es un libro abierto —decía—. Las olas son sus páginas, y la espuma, sus palabras escritas en blanco.\n"
        "Cuando el viento soplaba del norte, el agua se volvía gris como el acero. Cuando soplaba del sur, era un espejo azul donde el cielo se peinaba.\n"
        "Una tarde le pregunté por qué nunca se cansaba de mirarlo.\n"
        "—Porque nunca dice lo mismo —me respondió—. Es como una persona sabia: siempre tiene algo nuevo que contar a quien sabe escuchar."
    ],
    questions=[
        mc('single_choice', '«Las manos como raíces de olivo» es un ejemplo de…',
           ['Símil', 'Metáfora', 'Hipérbole', 'Onomatopeya'],
           'Compara las manos con raíces usando el nexo «como».'),
        mc('single_choice', '¿Cuál de estas frases del texto es una metáfora?',
           ['«El mar es un libro abierto»', '«Gris como el acero»',
            '«Como una persona sabia»', '«Las manos como raíces»'],
           'La metáfora identifica el mar con un libro sin usar «como».'),
        mc('inference_prediction', '¿Qué enseñaba la abuela al «leer el mar»?',
           ['A observar con atención lo que nos rodea', 'A nadar mejor', 'A pescar en verano', 'A escribir en la arena'],
           'Leer el mar es mirarlo con atención para descubrir lo que cambia cada día.'),
    ],
    vocab=[('nudosas', 'Con muchos nudos, retorcidas'), ('espuma', 'Burbujas blancas que forman las olas')],
)

READINGS[(8, 2)] = reading(
    title='El reloj cansado',
    pages=[
        "En el salón de la casa vieja vivía un reloj de péndulo que llevaba cien años trabajando. Cada noche, cuando todos dormían, suspiraba con sus engranajes oxidados.\n"
        "—Estoy cansado de contar las horas de los demás —le confesó una vez a la lámpara.\n"
        "La lámpara, que era tímida, parpadeó sin saber qué contestar. Fue el sillón quien, estirando sus brazos de terciopelo, le respondió con voz grave:\n"
        "—Sin ti, esta casa no sabría cuándo despertar ni cuándo soñar.\n"
        "Desde entonces, el reloj marca las horas con un tictac más alegre. Y si uno se queda muy quieto, a medianoche, puede escuchar cómo tararea una canción antigua."
    ],
    questions=[
        mc('single_choice', '¿Qué figura predomina en el texto?',
           ['Personificación', 'Hipérbole', 'Anáfora', 'Comparación'],
           'Objetos como el reloj, la lámpara y el sillón hablan, suspiran y sienten.'),
        mc('single_choice', '¿Qué palabra del texto es una onomatopeya?',
           ['«tictac»', '«suspiraba»', '«parpadeó»', '«tararea»'],
           '«Tictac» imita el sonido del reloj.'),
        mc('inference_prediction', '¿Qué le hace ver el sillón al reloj?',
           ['Que su trabajo es valioso para todos', 'Que debe descansar para siempre',
            'Que la lámpara es más importante', 'Que la casa será vendida'],
           'Le recuerda que gracias a él la casa sabe «cuándo despertar» y «cuándo soñar».'),
    ],
    vocab=[('engranajes', 'Ruedas dentadas de un mecanismo'), ('tararea', 'Canta en voz baja sin decir la letra')],
    events=[
        'El reloj suspira de cansancio.',
        'El reloj se confiesa con la lámpara.',
        'El sillón le responde que es valioso.',
        'El reloj marca las horas con más alegría.',
    ],
)

READINGS[(8, 4)] = reading(
    title='El día más largo del mundo',
    pages=[
        "Aquel lunes duró mil años. Me desperté con un sueño tan grande que podría haber dormido hasta el siglo siguiente. La mochila pesaba una tonelada y el camino a la escuela se estiraba como un chicle infinito.\n"
        "Esperé el recreo, esperé la campana, esperé el almuerzo, esperé la tarde. Esperé tanto que me crecieron raíces en la silla.\n"
        "Y cuando por fin sonó el timbre de salida, salí corriendo más rápido que un rayo. Llegué a casa, abrí la puerta y encontré a mi abuelo con un pastel: era mi cumpleaños, y yo lo había olvidado.\n"
        "Entonces el día más largo del mundo se volvió, de pronto, el más corto."
    ],
    questions=[
        mc('single_choice', '«La mochila pesaba una tonelada» es un ejemplo de…',
           ['Hipérbole', 'Personificación', 'Metáfora', 'Onomatopeya'],
           'Es una exageración para expresar lo pesada que se sentía la mochila.'),
        mc('single_choice', '¿Qué figura aparece en «Esperé el recreo, esperé la campana, esperé el almuerzo»?',
           ['Anáfora', 'Símil', 'Onomatopeya', 'Ironía'],
           'Repite «esperé» al comienzo de varias frases para transmitir impaciencia.'),
        mc('inference_prediction', '¿Por qué el día se vuelve «el más corto»?',
           ['Porque la sorpresa feliz cambió cómo lo sentía', 'Porque el reloj se adelantó',
            'Porque se fue a dormir temprano', 'Porque no hubo clases'],
           'La alegría del cumpleaños transforma la percepción del tiempo.'),
    ],
    vocab=[('tonelada', 'Unidad de peso igual a mil kilos'), ('infinito', 'Que no tiene fin')],
    events=[
        'El narrador despierta con mucho sueño.',
        'Espera impaciente durante las clases.',
        'Sale corriendo al sonar el timbre.',
        'Encuentra a su abuelo con un pastel.',
    ],
)

# ── Unidad 9 — Poesía: verso, rima y estrofa ────────────────────────────────

READINGS[(9, 1)] = reading(
    title='Cómo se mide un verso',
    pages=[
        "Para medir un verso contamos sus sílabas, pero con algunas reglas especiales.\n"
        "La primera es la sinalefa: cuando una palabra termina en vocal y la siguiente empieza por vocal, ambas sílabas se unen en una sola. Por ejemplo, en «la orilla del mar», «la» y «o» se pronuncian juntas: la-o-ri-lla se cuenta como tres sílabas.\n"
        "La segunda regla depende de la última palabra del verso. Si es aguda, como «mar» o «canción», se suma una sílaba. Si es esdrújula, como «pájaro», se resta una. Si es llana, como «sierra», el verso queda igual.\n"
        "Así, «con un rumor de cristal» tiene siete sílabas gramaticales, pero, como termina en palabra aguda, se cuenta como un verso de ocho: un octosílabo, el verso favorito de los romances."
    ],
    questions=[
        mc('single_choice', '¿Qué es la sinalefa?',
           ['La unión en una sílaba de la vocal final de una palabra y la inicial de la siguiente',
            'Una rima entre dos versos', 'Un verso de ocho sílabas', 'Una estrofa de cuatro versos'],
           'Es la regla que une vocales entre palabras, como en «la orilla».'),
        mc('single_choice', 'Si un verso termina en palabra aguda, ¿qué se hace al contar?',
           ['Se suma una sílaba', 'Se resta una sílaba', 'Queda igual', 'Se cuenta doble'],
           'Las agudas suman una: por eso «con un rumor de cristal» es octosílabo.'),
        mc('single_choice', '¿Cuántas sílabas métricas tiene un verso llano de ocho sílabas gramaticales?',
           ['Ocho', 'Siete', 'Nueve', 'Diez'],
           'Si el verso termina en palabra llana, no se suma ni se resta nada.'),
    ],
    vocab=[('esdrújula', 'Palabra acentuada en la antepenúltima sílaba'), ('octosílabo', 'Verso de ocho sílabas')],
)

READINGS[(9, 2)] = reading(
    title='Rimas que se dan la mano',
    pages=[
        "La rima es la repetición de sonidos al final de los versos, a partir de la última vocal acentuada.\n"
        "Cuando se repiten todos los sonidos, vocales y consonantes, la rima es consonante. Así ocurre entre «camino» y «destino», o entre «flor» y «amor».\n"
        "Cuando solo se repiten las vocales, la rima es asonante. «Luna» y «cuna» riman en consonante, pero «luna» y «pluma» lo hacen en asonante: coinciden la u y la a, aunque cambian las consonantes.\n"
        "Leamos estos versos:\n"
        "Por el sendero del monte\nbaja cantando el pastor,\nlleva en la mano una rama\ny en los ojos, todo el sol.\n"
        "Los versos pares, «pastor» y «sol», comparten la vocal o, pero no las consonantes finales: riman en asonante."
    ],
    questions=[
        mc('single_choice', '«Camino» y «destino» riman en…',
           ['Rima consonante', 'Rima asonante', 'No riman', 'Rima interna'],
           'Coinciden vocales y consonantes desde la última vocal acentuada: -ino.'),
        mc('single_choice', '«Luna» y «pluma» riman en…',
           ['Rima asonante', 'Rima consonante', 'No riman', 'Rima aguda'],
           'Solo coinciden las vocales u-a.'),
        tf('«Pastor» y «sol» tienen rima consonante.', False,
           'Comparten la vocal o, pero no las consonantes finales: es rima asonante.'),
    ],
    vocab=[('sendero', 'Camino estrecho'), ('pastor', 'Persona que cuida el ganado')],
    sentence='La rima es la repetición de sonidos al final de los versos.',
)

READINGS[(9, 4)] = reading(
    title='Tres estrofas famosas',
    pages=[
        "Una estrofa es un grupo de versos que se repite con la misma forma a lo largo de un poema. Algunas son famosas por su belleza y su dificultad.\n"
        "El soneto es la más prestigiosa: tiene catorce versos endecasílabos, organizados en dos cuartetos y dos tercetos. Llegó a España desde Italia en el siglo XVI, y poetas como Garcilaso de la Vega, Lope de Vega o Quevedo lo cultivaron con maestría.\n"
        "El romance, en cambio, nació del pueblo. Es una serie indefinida de versos octosílabos en la que riman en asonante los versos pares, mientras los impares quedan sueltos. Se cantaba en plazas y caminos, y así pasó de boca en boca durante siglos.\n"
        "La redondilla, por último, tiene cuatro versos octosílabos con rima consonante: el primero rima con el cuarto, y el segundo con el tercero."
    ],
    questions=[
        mc('single_choice', '¿Cuántos versos tiene un soneto?',
           ['Catorce', 'Doce', 'Ocho', 'Dieciséis'],
           'Dos cuartetos (4 + 4) y dos tercetos (3 + 3): catorce versos.'),
        mc('single_choice', '¿Qué versos riman en un romance?',
           ['Los pares, en asonante', 'Todos, en consonante', 'Los impares, en consonante', 'Ninguno'],
           'En el romance riman los pares en asonante y los impares quedan sueltos.'),
        mc('single_choice', '¿Desde dónde llegó el soneto a España?',
           ['Desde Italia', 'Desde Francia', 'Desde Grecia', 'Desde Inglaterra'],
           'Llegó desde Italia en el siglo XVI.'),
    ],
    vocab=[('endecasílabos', 'Versos de once sílabas'), ('indefinida', 'Sin un número fijo')],
)

# ── Unidad 10 — Teatro y diálogo ────────────────────────────────────────────

READINGS[(10, 1)] = reading(
    title='Cómo se construye una obra de teatro',
    pages=[
        "Una obra de teatro no se escribe como una novela. No hay un narrador que cuente lo que pasa: todo ocurre a través del diálogo de los personajes y de lo que el público ve en el escenario.\n"
        "Para organizarse, la obra se divide en actos, que son las grandes partes de la historia; entre un acto y otro suele bajar el telón. Cada acto, a su vez, se divide en escenas, que cambian cuando entra o sale un personaje.\n"
        "El autor también escribe acotaciones, casi siempre entre paréntesis o en cursiva. En ellas indica cómo es el lugar, qué hora es, cómo se mueven los actores o en qué tono deben hablar.\n"
        "Por eso se dice que el texto teatral tiene dos vidas: una en el papel y otra, la más importante, sobre el escenario."
    ],
    questions=[
        mc('single_choice', '¿Qué marca el cambio de escena?',
           ['La entrada o salida de un personaje', 'Un cambio de narrador', 'El final de un capítulo', 'Una rima nueva'],
           'Las escenas cambian cuando entra o sale un personaje.'),
        mc('single_choice', '¿Por qué en el teatro no hay narrador?',
           ['Porque la historia avanza con el diálogo y la acción en escena', 'Porque el autor lo prohíbe',
            'Porque las obras son muy cortas', 'Porque el público narra la obra'],
           'Todo ocurre «a través del diálogo de los personajes».'),
        tf('Las acotaciones indican cómo es el lugar y cómo se mueven los actores.', True,
           'Son las instrucciones del autor para la representación.'),
    ],
    vocab=[('telón', 'Cortina grande que cubre el escenario'), ('cursiva', 'Letra inclinada hacia la derecha')],
)

READINGS[(10, 2)] = reading(
    title='El testamento',
    pages=[
        "(Salón de una casa antigua. Los hermanos LUIS y MARTA leen una carta.)\n"
        "LUIS.— «La casa de la playa será para quien la cuide». ¿Qué clase de testamento es este?\n"
        "MARTA.— Uno de papá. Siempre le gustaron los acertijos.\n"
        "LUIS.— Yo tengo trabajo en la ciudad, no puedo cuidar nada. Vendámosla y repartamos el dinero.\n"
        "MARTA.— (Se acerca a la ventana.) Yo aprendí a nadar en esa playa. No pienso venderla.\n"
        "LUIS.— ¡Tú siempre fuiste su favorita!\n"
        "MARTA.— (Se vuelve, dolida.) Y tú siempre estuviste lejos.\n"
        "(Silencio. LUIS baja la mirada. Saca de su bolsillo una llave vieja.)\n"
        "LUIS.— Todavía la tengo. La llave de la casa. No sé por qué la guardé.\n"
        "MARTA.— (Sonríe apenas.) Yo sí sé."
    ],
    questions=[
        mc('single_choice', '¿Cuál es el conflicto principal de la escena?',
           ['Los hermanos no se ponen de acuerdo sobre qué hacer con la casa', 'Los hermanos no saben leer la carta',
            'Marta quiere mudarse a la ciudad', 'Luis perdió la llave de la casa'],
           'Luis quiere vender y Marta quiere conservarla: esa oposición es el conflicto.'),
        mc('inference_prediction', '¿Qué revela que Luis haya guardado la llave?',
           ['Que también siente apego por la casa y por su padre', 'Que quiere entrar a escondidas',
            'Que olvidó devolverla', 'Que la casa ya fue vendida'],
           'Guardarla sin saber por qué muestra un cariño que no se atrevía a reconocer.'),
        mc('single_choice', '¿Qué indica la acotación «(Se vuelve, dolida.)»?',
           ['El gesto y la emoción con que Marta debe hablar', 'Que Marta sale de escena',
            'Que termina el acto', 'Que habla otro personaje'],
           'Las acotaciones guían gestos y emociones de los actores.'),
    ],
    vocab=[('testamento', 'Documento donde alguien deja sus bienes al morir'), ('acertijos', 'Adivinanzas o enigmas')],
    events=[
        'Los hermanos leen el testamento.',
        'Luis propone vender la casa.',
        'Marta le reprocha que siempre estuvo lejos.',
        'Luis muestra la llave que guardó.',
    ],
)

READINGS[(10, 4)] = reading(
    title='El socio impuntual',
    pages=[
        "(Una plaza. DON FERMÍN, un comerciante, espera a su socio. Está solo.)\n"
        "DON FERMÍN.— ¡Qué lenta pasa la tarde cuando uno tiene prisa! Si hoy firmo el contrato, mañana seré el hombre más rico del pueblo. Y si no lo firmo… no, no quiero pensarlo. (Mira su reloj.) Cinco minutos tarde. Nadie llega tarde a hacerse rico.\n"
        "(Entra RODRIGO, su socio, sonriente.)\n"
        "RODRIGO.— ¡Amigo Fermín! Disculpe la demora.\n"
        "DON FERMÍN.— No es nada, querido Rodrigo. (Aparte, al público.) Si vuelve a llegar tarde, le cobraré intereses.\n"
        "RODRIGO.— (Aparte, al público.) Si supiera que hoy vengo a romper el trato…"
    ],
    questions=[
        mc('single_choice', '¿Qué es lo que dice don Fermín al comienzo, cuando está solo?',
           ['Un monólogo', 'Un aparte', 'Una acotación', 'Un diálogo'],
           'Habla solo, en voz alta, expresando sus pensamientos: es un monólogo.'),
        mc('single_choice', '¿Quién escucha los apartes?',
           ['Solo el público', 'Todos los personajes', 'Únicamente Rodrigo', 'Nadie, ni siquiera el público'],
           'El aparte se dice al público sin que los demás personajes lo oigan.'),
        mc('inference_prediction', '¿Qué efecto produce el último aparte de Rodrigo?',
           ['El público sabe algo que don Fermín ignora, y crece la tensión', 'Termina la obra',
            'Rodrigo se disculpa sinceramente', 'Don Fermín descubre el engaño'],
           'El público conoce la intención de Rodrigo antes que don Fermín: es ironía dramática.'),
    ],
    vocab=[('demora', 'Retraso, tardanza'), ('intereses', 'Dinero extra que se cobra por un préstamo o un retraso')],
    events=[
        'Don Fermín espera solo en la plaza.',
        'Mira el reloj: su socio llega tarde.',
        'Rodrigo entra y se disculpa.',
        'Rodrigo revela al público que romperá el trato.',
    ],
)
