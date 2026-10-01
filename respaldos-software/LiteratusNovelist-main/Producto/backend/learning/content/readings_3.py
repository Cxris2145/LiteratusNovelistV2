"""Lecturas de las unidades 11 a 15. Textos originales del Taller Literatus."""

from .fmt import mc, reading, tf

READINGS = {}

# ── Unidad 11 — Mitos y leyendas ────────────────────────────────────────────

READINGS[(11, 1)] = reading(
    title='Cómo nacieron las estrellas',
    pages=[
        "Cuentan los pastores de la montaña que, al principio, la noche era completamente oscura. Los animales tenían miedo, y los hombres no se atrevían a salir de sus cuevas.\n"
        "Una muchacha llamada Aina tejía mantas junto al fuego. Cansada de ver a su pueblo temblar, subió a la cumbre más alta con su cesta de brasas y le pidió al Cielo que no volviera a dejarlos a oscuras.\n"
        "El Cielo, conmovido, le propuso un trato: si Aina lanzaba sus brasas hacia lo alto, él las guardaría para siempre. Pero ella ya no podría volver a encender su fuego.\n"
        "Aina aceptó. Lanzó las brasas una a una, y cada una se quedó prendida en la noche. Desde entonces hay estrellas, y los pastores dicen que la más brillante es el corazón de Aina, que todavía nos cuida."
    ],
    questions=[
        mc('single_choice', '¿Qué intenta explicar este mito?',
           ['El origen de las estrellas', 'Cómo se tejen las mantas', 'Por qué hay montañas', 'Quién inventó el fuego'],
           'Los mitos explican el origen de elementos de la naturaleza.'),
        mc('single_choice', '¿Qué sacrificio hace Aina?',
           ['Renuncia a volver a encender su propio fuego', 'Abandona su pueblo para siempre',
            'Regala todas sus mantas', 'Se queda a vivir en la cumbre'],
           'El trato era lanzar las brasas y no volver a encender su fuego.'),
        mc('inference_prediction', '¿Qué valor destaca el mito?',
           ['La generosidad de quien se sacrifica por los demás', 'La astucia para engañar al Cielo',
            'La riqueza de los pastores', 'El miedo a la noche'],
           'Aina entrega su fuego para proteger a todo su pueblo.'),
    ],
    vocab=[('brasas', 'Trozos de leña encendidos, sin llama'), ('cumbre', 'Parte más alta de una montaña')],
    events=[
        'La noche era completamente oscura.',
        'Aina sube a la cumbre con sus brasas.',
        'El Cielo le propone un trato.',
        'Aina lanza las brasas y nacen las estrellas.',
    ],
)

READINGS[(11, 2)] = reading(
    title='La leyenda del lago de las campanas',
    pages=[
        "En el valle de Almenara hay un lago de aguas quietas donde, según dicen, en las noches de viento se oyen campanas bajo el agua.\n"
        "Hace siglos, allí se alzaba una aldea con una iglesia de tres campanas. Una tarde de tormenta llegó un anciano pidiendo refugio. Todos le cerraron la puerta, menos una pastora que vivía en las afueras y compartió con él su pan.\n"
        "Al amanecer, el anciano le dijo que subiera al monte y no mirara atrás. La pastora obedeció. A sus espaldas oyó un rugido de agua: el río se había desbordado y cubría el valle entero.\n"
        "Cuando por fin se volvió, donde antes estaba la aldea solo había un lago. Los viejos del lugar aseguran que las campanas siguen sonando para recordar que la puerta abierta salva y la cerrada ahoga."
    ],
    questions=[
        mc('single_choice', '¿Qué rasgo de leyenda tiene este relato?',
           ['Se asocia a un lugar concreto y mezcla lo real con lo fantástico', 'Explica el origen del universo con dioses',
            'Tiene acotaciones para actores', 'Está escrito en verso rimado'],
           'Las leyendas se vinculan a un lugar (el lago de Almenara) y suman elementos maravillosos.'),
        mc('single_choice', '¿Por qué se salva la pastora?',
           ['Porque fue la única que ayudó al anciano', 'Porque sabía nadar',
            'Porque vivía en la iglesia', 'Porque el anciano era su abuelo'],
           'Su hospitalidad es recompensada con el aviso de subir al monte.'),
        tf('La pastora miró hacia atrás mientras subía al monte.', False,
           'Obedeció, y solo se volvió cuando ya estaba a salvo.'),
    ],
    vocab=[('refugio', 'Lugar donde protegerse'), ('desbordado', 'Que ha salido de su cauce')],
    events=[
        'Un anciano pide refugio en la aldea.',
        'La pastora comparte su pan con él.',
        'La pastora sube al monte sin mirar atrás.',
        'El río cubre el valle y forma un lago.',
    ],
)

READINGS[(11, 4)] = reading(
    title='El vuelo de Ícaro',
    author='Mito griego, versión del Taller Literatus',
    pages=[
        "Dédalo era el inventor más ingenioso de Atenas. El rey Minos de Creta lo encerró junto a su hijo Ícaro para que nunca revelara los secretos del laberinto que había construido.\n"
        "Como el mar y la tierra estaban vigilados, Dédalo miró al cielo. Reunió plumas de aves, las unió con hilo y cera, y fabricó dos pares de alas.\n"
        "—Vuela a media altura —le advirtió a su hijo—. Si bajas mucho, la humedad del mar mojará las plumas; si subes demasiado, el sol derretirá la cera.\n"
        "Al principio Ícaro obedeció. Pero la emoción de volar lo embriagó, y subió cada vez más alto. El calor del sol ablandó la cera, las plumas se desprendieron y el muchacho cayó al mar. Dédalo, desolado, llegó solo a tierra firme."
    ],
    questions=[
        mc('single_choice', '¿Por qué cayó Ícaro al mar?',
           ['Voló demasiado alto y el sol derritió la cera', 'Voló muy bajo y se mojaron las plumas',
            'Minos lo derribó con una flecha', 'Se cansó de volar'],
           'Desobedeció el consejo de su padre y subió demasiado.'),
        mc('inference_prediction', '¿Qué enseñanza suele extraerse de este mito?',
           ['Los excesos y la imprudencia tienen consecuencias', 'Siempre hay que volar lo más alto posible',
            'Los inventos son peligrosos', 'Los padres nunca tienen razón'],
           'Ícaro representa la desmesura: ir más allá del límite prudente.'),
        mc('character_role', '¿Quién construyó las alas?',
           ['Dédalo', 'Ícaro', 'El rey Minos', 'Teseo'],
           'Dédalo, el inventor, las fabricó con plumas, hilo y cera.'),
    ],
    vocab=[('ingenioso', 'Que tiene talento para inventar'), ('desolado', 'Muy triste y afligido')],
    events=[
        'Minos encierra a Dédalo e Ícaro.',
        'Dédalo fabrica alas con plumas y cera.',
        'Ícaro sube cada vez más alto.',
        'La cera se derrite e Ícaro cae al mar.',
    ],
)

# ── Unidad 12 — Fábulas y moralejas ─────────────────────────────────────────

READINGS[(12, 1)] = reading(
    title='La cigarra y la hormiga',
    author='Fábula tradicional, versión del Taller Literatus',
    pages=[
        "Durante todo el verano, la cigarra cantó bajo el sol. Desde su rama veía pasar a la hormiga, que iba y venía cargando granos de trigo.\n"
        "—¿Por qué trabajas tanto con este calor? —le preguntaba—. Ven a cantar conmigo.\n"
        "—Guardo comida para el invierno —respondía la hormiga—. Deberías hacer lo mismo.\n"
        "La cigarra se reía y seguía cantando.\n"
        "Llegó el invierno, y con él la nieve. La cigarra, hambrienta y tiritando, llamó a la puerta de la hormiga para pedirle algo de comer.\n"
        "—¿Qué hiciste durante el verano? —le preguntó la hormiga.\n"
        "—Cantaba —contestó la cigarra.\n"
        "—Pues ahora, baila —dijo la hormiga, aunque, conmovida, terminó compartiendo con ella un poco de trigo.\n"
        "Moraleja: quien trabaja a tiempo no pasa necesidad, y quien tiene, bien hace en compartir."
    ],
    questions=[
        mc('single_choice', '¿Qué defecto representa la cigarra al comienzo?',
           ['La imprevisión: no piensa en el futuro', 'La avaricia', 'La mentira', 'La cobardía'],
           'Canta todo el verano sin preparar comida para el invierno.'),
        mc('single_choice', '¿Qué hace la hormiga al final de esta versión?',
           ['Comparte un poco de trigo con la cigarra', 'Le cierra la puerta',
            'Se va a cantar con ella', 'Le vende el trigo'],
           'Aunque la reprende, «terminó compartiendo con ella un poco de trigo».'),
        tf('Esta fábula termina con una moraleja.', True,
           'La enseñanza final aparece explícita, como en muchas fábulas.'),
    ],
    vocab=[('tiritando', 'Temblando de frío'), ('hambrienta', 'Que tiene mucha hambre')],
    events=[
        'La cigarra canta durante el verano.',
        'La hormiga guarda trigo para el invierno.',
        'La cigarra pide comida en invierno.',
        'La hormiga comparte un poco de trigo.',
    ],
)

READINGS[(12, 2)] = reading(
    title='El cuervo y la vasija',
    author='Fábula tradicional, versión del Taller Literatus',
    pages=[
        "Era un verano tan seco que los ríos se habían convertido en caminos de piedra. Un cuervo, muerto de sed, encontró en un jardín una vasija con un poco de agua en el fondo.\n"
        "Metió el pico, pero no alcanzaba. Intentó volcarla, pero era demasiado pesada. Otro pájaro habría abandonado. El cuervo, en cambio, se quedó mirando la vasija y luego las piedrecitas del camino.\n"
        "Tomó una piedra con el pico y la dejó caer dentro. Luego otra, y otra más. Con cada piedra, el agua subía un poco. Tardó toda la tarde, pero al anochecer el agua llegó hasta el borde, y el cuervo bebió hasta saciarse."
    ],
    questions=[
        mc('inference_prediction', '¿Qué moraleja se desprende de la fábula, aunque no esté escrita?',
           ['El ingenio y la paciencia resuelven lo que la fuerza no puede', 'Hay que desconfiar de los jardines',
            'Los cuervos son animales perezosos', 'Nunca hay que beber agua estancada'],
           'El cuervo no lo logró con fuerza, sino pensando y perseverando.'),
        mc('single_choice', '¿Qué hizo el cuervo para alcanzar el agua?',
           ['Echó piedras en la vasija hasta que el agua subió', 'Rompió la vasija',
            'Llamó a otros pájaros', 'Esperó a que lloviera'],
           'Cada piedra hacía subir el nivel del agua.'),
        mc('context_vocabulary', '¿Qué significa «bebió hasta saciarse»?',
           ['Bebió hasta quedar satisfecho', 'Bebió muy poco', 'Bebió con desconfianza', 'Bebió de noche'],
           'Saciarse es satisfacer por completo el hambre o la sed.'),
    ],
    vocab=[('vasija', 'Recipiente para contener líquidos'), ('volcarla', 'Inclinarla hasta que caiga lo que contiene')],
    events=[
        'El cuervo encuentra la vasija con poca agua.',
        'Intenta volcarla sin conseguirlo.',
        'Echa piedras dentro, una por una.',
        'Bebe al anochecer hasta saciarse.',
    ],
)

READINGS[(12, 4)] = reading(
    title='Los grandes fabulistas',
    pages=[
        "La fábula es uno de los géneros más antiguos del mundo. En la Grecia antigua se atribuyeron muchas a Esopo, un narrador del que casi nada se sabe con certeza. Suyas serían historias tan conocidas como «La liebre y la tortuga» o «La zorra y las uvas».\n"
        "Siglos más tarde, en la Francia del siglo XVII, Jean de La Fontaine reescribió muchas de esas fábulas en verso, con elegancia e ironía, para retratar los defectos de la sociedad de su época.\n"
        "En España, durante el siglo XVIII, destacaron Félix María de Samaniego y Tomás de Iriarte. Samaniego escribió fábulas morales pensadas para educar a los jóvenes; Iriarte, en cambio, dedicó sus «Fábulas literarias» a criticar a los malos escritores.\n"
        "Todos ellos compartían una idea: que una historia breve, con animales que hablan, puede enseñar más que un largo sermón."
    ],
    questions=[
        mc('single_choice', '¿En qué país y siglo escribió La Fontaine?',
           ['Francia, siglo XVII', 'España, siglo XVIII', 'Grecia, Antigüedad', 'Italia, siglo XV'],
           'El texto lo sitúa en la Francia del siglo XVII.'),
        mc('single_choice', '¿Qué criticaban las «Fábulas literarias» de Iriarte?',
           ['A los malos escritores', 'A los reyes de Francia', 'A los animales salvajes', 'A los campesinos'],
           'Iriarte las dedicó «a criticar a los malos escritores».'),
        mc('single_choice', '¿Qué idea compartían todos estos fabulistas?',
           ['Que una historia breve puede enseñar más que un sermón', 'Que las fábulas deben ser muy largas',
            'Que solo los niños leen fábulas', 'Que los animales no deben hablar'],
           'Es la conclusión del texto.'),
    ],
    vocab=[('atribuyeron', 'Consideraron que alguien era su autor'), ('sermón', 'Discurso largo para dar consejos morales')],
)

# ── Unidad 13 — Lo fantástico y el terror ───────────────────────────────────

READINGS[(13, 1)] = reading(
    title='El espejo que se atrasaba',
    pages=[
        "El espejo del pasillo de la abuela tenía una costumbre extraña: se atrasaba tres segundos.\n"
        "Lo descubrí un martes, al pasar corriendo. Mi reflejo tardó un instante en aparecer y, cuando lo hizo, todavía estaba terminando de peinarse, aunque yo ya había guardado el peine. Al principio pensé que era cansancio. Luego hice la prueba: levanté la mano y conté. Uno, dos, tres. Recién entonces el reflejo levantó la suya.\n"
        "La abuela no se sorprendió.\n"
        "—Siempre ha sido lento —dijo, mientras regaba los geranios—. Tu abuelo decía que era el único espejo del mundo que te deja ver cómo eras hace un momento.\n"
        "Desde entonces, cuando estoy triste, me paro frente a él y sonrío. Tres segundos después, mi reflejo me devuelve la sonrisa, como si alguien me la hubiera guardado."
    ],
    questions=[
        mc('single_choice', '¿Qué hace fantástico a este relato?',
           ['Un hecho imposible aparece en un ambiente cotidiano', 'Ocurre en otro planeta',
            'Tiene dragones y magos', 'Está escrito en verso'],
           'Lo fantástico irrumpe en la vida diaria: un espejo común que se atrasa.'),
        mc('single_choice', '¿Cómo reacciona la abuela ante el fenómeno?',
           ['Con total naturalidad', 'Con terror', 'Llamando a un científico', 'Rompiendo el espejo'],
           'No se sorprende: dice que «siempre ha sido lento».'),
        mc('inference_prediction', '¿Qué siente el narrador cuando el reflejo le devuelve la sonrisa?',
           ['Consuelo, como si alguien lo acompañara', 'Miedo a su reflejo', 'Enojo con la abuela', 'Aburrimiento'],
           'Lo describe como una sonrisa guardada para él: una forma de compañía.'),
    ],
    vocab=[('reflejo', 'Imagen que devuelve un espejo'), ('geranios', 'Plantas de flores de colores vivos')],
    events=[
        'El narrador nota que el espejo se atrasa.',
        'Hace la prueba levantando la mano.',
        'La abuela explica que siempre fue lento.',
        'El narrador sonríe al espejo cuando está triste.',
    ],
)

READINGS[(13, 2)] = reading(
    title='Pasos en el desván',
    pages=[
        "La primera noche en la casa nueva, Sofía oyó pasos sobre el techo de su cuarto. Eran lentos, pesados, y se detenían justo encima de su cama.\n"
        "Pensó que era el viento. La segunda noche, los pasos volvieron, y esta vez los acompañaba un arrastrar de muebles. Sofía se tapó hasta la cabeza y contó hasta cien.\n"
        "La tercera noche decidió subir. Tomó la linterna, abrió la trampilla del desván y asomó la cabeza. Olía a polvo y a madera vieja. La luz tembló sobre cajas, telarañas, un sillón cubierto con una sábana…\n"
        "Y entonces, al fondo, dos ojos amarillos se encendieron en la oscuridad.\n"
        "Sofía contuvo el aliento. Los ojos se acercaron, despacio. Un maullido suave rompió el silencio: era un gato gris, flaco y asustado, que llevaba días atrapado allí arriba."
    ],
    questions=[
        mc('single_choice', '¿Qué técnica usa el autor para crear suspenso?',
           ['Retrasa la explicación y aumenta la tensión noche tras noche', 'Cuenta el final en la primera línea',
            'Usa rimas en cada párrafo', 'Explica todo desde el principio'],
           'La causa de los pasos se revela solo al final, después de ir creciendo la tensión.'),
        mc('single_choice', '¿Qué había realmente en el desván?',
           ['Un gato gris atrapado', 'Un fantasma', 'Un ladrón', 'Un búho'],
           'Los ojos amarillos eran de un gato que llevaba días atrapado.'),
        mc('single_choice', '¿Cuál es el momento de mayor tensión?',
           ['Cuando se encienden dos ojos amarillos en la oscuridad', 'Cuando Sofía llega a la casa nueva',
            'Cuando cuenta hasta cien', 'Cuando huele a polvo'],
           'Es el clímax: justo antes de descubrir qué era.'),
    ],
    vocab=[('trampilla', 'Puerta pequeña en el suelo o el techo'), ('telarañas', 'Redes que tejen las arañas')],
    events=[
        'Sofía oye pasos la primera noche.',
        'Los pasos vuelven con ruido de muebles.',
        'Sofía sube al desván con una linterna.',
        'Descubre un gato gris atrapado.',
    ],
)

READINGS[(13, 4)] = reading(
    title='Maestros del miedo',
    pages=[
        "El miedo ha inspirado algunas de las obras más recordadas de la literatura.\n"
        "En 1818, la inglesa Mary Shelley publicó «Frankenstein», la historia de un científico que da vida a una criatura y luego la abandona. Muchos la consideran una de las primeras novelas de ciencia ficción.\n"
        "El estadounidense Edgar Allan Poe perfeccionó el cuento de terror psicológico. En «El corazón delator», el narrador insiste en que no está loco mientras confiesa un crimen que su propia conciencia no le deja olvidar.\n"
        "En España, Gustavo Adolfo Bécquer recogió tradiciones populares en sus «Leyendas», donde lo sobrenatural aparece en monasterios, bosques y ruinas.\n"
        "Y en 1897, el irlandés Bram Stoker publicó «Drácula», contada a través de cartas y diarios de sus personajes."
    ],
    questions=[
        mc('single_choice', '¿Quién escribió «Frankenstein»?',
           ['Mary Shelley', 'Bram Stoker', 'Edgar Allan Poe', 'Gustavo Adolfo Bécquer'],
           'Mary Shelley la publicó en 1818.'),
        mc('single_choice', '¿Cómo está contada «Drácula»?',
           ['A través de cartas y diarios de los personajes', 'En verso',
            'Como una obra de teatro', 'Por el propio Drácula en primera persona'],
           'Es una novela epistolar: la historia se arma con cartas y diarios.'),
        tf('En «El corazón delator», el narrador admite desde el principio que está loco.', False,
           'Al contrario: insiste en que no está loco.'),
    ],
    vocab=[('sobrenatural', 'Que va más allá de las leyes de la naturaleza'), ('conciencia', 'Voz interior que juzga lo que hacemos')],
)

# ── Unidad 14 — Viajes y aventuras ──────────────────────────────────────────

READINGS[(14, 1)] = reading(
    title='El mapa en la botella',
    pages=[
        "Leo encontró la botella una mañana de marea baja, atrapada entre las rocas. Dentro había un papel enrollado, amarillento, atado con un hilo rojo.\n"
        "Era un mapa. Mostraba la costa del pueblo, la isla de los Cuervos y, en su punta norte, una cruz dibujada con tinta desteñida. Debajo, una frase: «Para quien se atreva».\n"
        "Leo pasó el día mirándolo. Su madre le dijo que era una broma; su amigo Tito, que era peligroso. Pero esa noche Leo no pudo dormir.\n"
        "Al amanecer, preparó una mochila con agua, pan, una brújula y una linterna. Dejó una nota en la mesa: «Vuelvo antes de la cena». Luego empujó el bote de su abuelo hasta el agua y remó hacia la isla, sin saber que alguien lo observaba desde el muelle."
    ],
    questions=[
        mc('single_choice', '¿Cuál es el «llamado a la aventura» en el relato?',
           ['El mapa encontrado en la botella', 'La nota que deja en la mesa',
            'El desayuno de pan y agua', 'El bote del abuelo'],
           'El mapa es el hecho que invita al héroe a dejar su mundo conocido.'),
        mc('character_role', '¿Qué papel cumplen la madre y Tito?',
           ['Intentan disuadirlo y ponen a prueba su decisión', 'Lo acompañan a la isla',
            'Dibujaron el mapa', 'Son antagonistas que lo persiguen'],
           'Sus advertencias son el obstáculo inicial que Leo decide superar.'),
        mc('inference_prediction', '¿Qué efecto tiene la última frase del texto?',
           ['Genera intriga sobre quién lo observa', 'Resuelve el misterio del mapa',
            'Indica que Leo regresó', 'Muestra que era una broma'],
           'Deja una pregunta abierta que invita a seguir leyendo.'),
    ],
    vocab=[('desteñida', 'Que ha perdido color'), ('brújula', 'Instrumento que indica el norte')],
    events=[
        'Leo encuentra la botella entre las rocas.',
        'Su madre y Tito intentan disuadirlo.',
        'Leo prepara la mochila al amanecer.',
        'Leo rema hacia la isla de los Cuervos.',
    ],
)

READINGS[(14, 2)] = reading(
    title='La balsa',
    pages=[
        "Llevaban cuatro días en la balsa cuando se acabó el agua dulce. El sol caía como plomo sobre los tres náufragos: Irene, el viejo Gaspar y el pequeño Bruno.\n"
        "—Si no llueve mañana, no aguantaremos —murmuró Gaspar.\n"
        "Irene miró el horizonte y luego la lona que los protegía del sol. Tuvo una idea. Extendió la lona en forma de embudo, con una lata en el centro, y la ató a los palos de la balsa.\n"
        "Esa noche, las estrellas desaparecieron detrás de nubes espesas. Al principio fueron unas gotas; luego, un chaparrón. El agua corrió por la lona hasta la lata, y los tres bebieron riendo, con la cara al cielo.\n"
        "Al día siguiente, una gaviota se posó en la balsa. Gaspar sonrió por primera vez: siempre había dicho que las gaviotas no se alejan demasiado de la tierra."
    ],
    questions=[
        mc('single_choice', '¿Qué problema enfrentan los náufragos?',
           ['Se les acabó el agua dulce', 'La balsa se hundió', 'Los persigue un barco pirata', 'Perdieron la brújula'],
           'La falta de agua pone en peligro sus vidas.'),
        mc('single_choice', '¿Cómo resuelve Irene el problema?',
           ['Arma un embudo con la lona para recoger la lluvia', 'Bebe agua de mar',
            'Nada hasta la costa', 'Atrapa una gaviota'],
           'La lona en forma de embudo conduce la lluvia hasta la lata.'),
        mc('inference_prediction', '¿Por qué sonríe Gaspar al ver la gaviota?',
           ['Porque cree que la tierra está cerca', 'Porque podrán comerla',
            'Porque anuncia lluvia', 'Porque es su mascota'],
           'Para él, las gaviotas no se alejan mucho de la costa: es una señal de esperanza.'),
    ],
    vocab=[('náufragos', 'Personas que sobreviven a un naufragio'), ('chaparrón', 'Lluvia fuerte y de corta duración')],
    events=[
        'Se acaba el agua dulce en la balsa.',
        'Irene arma un embudo con la lona.',
        'Un chaparrón llena la lata de agua.',
        'Una gaviota se posa en la balsa.',
    ],
)

READINGS[(14, 4)] = reading(
    title='Exploradores de papel',
    pages=[
        "Algunos de los viajes más emocionantes de la historia nunca ocurrieron: fueron escritos.\n"
        "En 1719, Daniel Defoe publicó «Robinson Crusoe», la historia de un náufrago que sobrevive durante años en una isla desierta y que, con el tiempo, conoce a Viernes, su compañero.\n"
        "El francés Julio Verne llevó a sus lectores al fondo del mar en «Veinte mil leguas de viaje submarino», a bordo del Nautilus del capitán Nemo, y alrededor del planeta en «La vuelta al mundo en ochenta días», con el puntual Phileas Fogg.\n"
        "En 1883, el escocés Robert Louis Stevenson publicó «La isla del tesoro», donde el joven Jim Hawkins se enfrenta al astuto pirata Long John Silver.\n"
        "Ninguno de estos autores necesitó un pasaporte: les bastó la imaginación."
    ],
    questions=[
        mc('single_choice', '¿Quién es el capitán del Nautilus?',
           ['El capitán Nemo', 'Phileas Fogg', 'Long John Silver', 'Robinson Crusoe'],
           'El Nautilus es el submarino del capitán Nemo.'),
        mc('single_choice', '¿Qué personaje se enfrenta a Long John Silver?',
           ['Jim Hawkins', 'Viernes', 'Phileas Fogg', 'El capitán Nemo'],
           'En «La isla del tesoro», el joven Jim Hawkins se enfrenta al pirata.'),
        mc('inference_prediction', '¿Qué quiere decir que «ninguno necesitó un pasaporte»?',
           ['Que sus viajes nacieron de la imaginación, no de viajar de verdad', 'Que eran ciudadanos de todos los países',
            'Que viajaban en secreto', 'Que perdieron sus documentos'],
           'Destaca que crearon mundos y viajes con la escritura.'),
    ],
    vocab=[('desierta', 'Sin habitantes'), ('astuto', 'Hábil para engañar o lograr lo que quiere')],
)

# ── Unidad 15 — Narrador y punto de vista ───────────────────────────────────

READINGS[(15, 1)] = reading(
    title='El libro de mi hermana',
    pages=[
        "Nunca fui bueno para el fútbol. Lo supe a los nueve años, cuando el balón me pasó entre las piernas en el partido más importante del curso. Todavía escucho las risas.\n"
        "Esa tarde volví a casa arrastrando los pies. Mi hermana mayor, que leía en el sofá, levantó la vista y no me preguntó nada. Solo me pasó el libro que tenía en las manos.\n"
        "—Toma. Este es mejor que cualquier partido.\n"
        "Era una novela de piratas. Esa noche la leí entera, con la linterna bajo las sábanas. Al día siguiente pedí otra.\n"
        "Hoy trabajo en una biblioteca. A veces, cuando veo entrar a un niño con cara de derrota, me acuerdo de mi hermana y busco en los estantes el libro exacto que necesita."
    ],
    questions=[
        mc('single_choice', '¿Qué tipo de narrador tiene el texto?',
           ['Narrador protagonista, en primera persona', 'Narrador omnisciente', 'Narrador testigo', 'Narrador objetivo'],
           'El narrador cuenta su propia historia usando «yo».'),
        mc('single_choice', '¿Qué limita a un narrador protagonista?',
           ['Solo conoce sus propios pensamientos, no los de los demás', 'No puede hablar de sí mismo',
            'Debe narrar en tercera persona', 'No puede recordar el pasado'],
           'Por eso no sabemos qué pensó la hermana: el narrador solo cuenta lo que vio.'),
        mc('inference_prediction', '¿Por qué busca libros para los niños «con cara de derrota»?',
           ['Quiere hacer por ellos lo que su hermana hizo por él', 'Porque es su obligación',
            'Porque no le gustan los niños', 'Porque quiere venderles libros'],
           'Repite el gesto que cambió su vida.'),
    ],
    vocab=[('derrota', 'Fracaso en una competencia o empeño'), ('sábanas', 'Telas que cubren la cama')],
    events=[
        'El narrador falla en el partido.',
        'Su hermana le presta una novela.',
        'Lee la novela entera esa noche.',
        'Trabaja en una biblioteca.',
    ],
)

READINGS[(15, 2)] = reading(
    title='El tren de las siete',
    pages=[
        "En la estación de Castroviejo, tres personas esperaban el tren de las siete.\n"
        "La señora Ofelia apretaba su bolso contra el pecho. Nadie lo sabía, pero dentro llevaba la carta con la que iba a pedirle perdón a su hija, después de diez años sin hablarse.\n"
        "A su lado, el joven Andrés fingía leer el periódico. En realidad, repasaba mentalmente lo que diría en su primera entrevista de trabajo, y sentía que el corazón se le salía por la boca.\n"
        "Un poco más allá, el jefe de estación miraba su reloj con impaciencia. Pensaba en su jubilación, que llegaría en dos semanas, y en que echaría de menos, aunque jamás lo confesaría, el olor a hierro de los andenes.\n"
        "El tren llegó puntual. Ninguno de los tres supo nunca lo que pensaban los otros."
    ],
    questions=[
        mc('single_choice', '¿Qué tipo de narrador tiene este texto?',
           ['Omnisciente', 'Protagonista', 'Testigo', 'En segunda persona'],
           'Conoce los pensamientos y secretos de todos los personajes.'),
        mc('single_choice', '¿Qué frase demuestra que el narrador sabe más que los personajes?',
           ['«Ninguno de los tres supo nunca lo que pensaban los otros»', '«El tren llegó puntual»',
            '«Tres personas esperaban el tren»', '«Miraba su reloj con impaciencia»'],
           'El narrador conoce lo que los propios personajes ignoran entre sí.'),
        mc('single_choice', '¿Qué secreto lleva la señora Ofelia?',
           ['Una carta para pedir perdón a su hija', 'Dinero para su jubilación',
            'Un periódico viejo', 'Una entrevista de trabajo'],
           'En su bolso lleva la carta de reconciliación.'),
    ],
    vocab=[('andenes', 'Plataformas de las estaciones de tren'), ('jubilación', 'Retiro del trabajo por edad')],
)

READINGS[(15, 4)] = reading(
    title='La primera canción',
    pages=[
        "Yo estaba en la tercera fila del teatro la noche en que Lucía Méndez cantó por primera vez. Lo recuerdo porque llovía y la sala estaba medio vacía.\n"
        "Salió al escenario con un vestido prestado, demasiado largo, y tropezó al llegar al micrófono. Alguien, detrás de mí, soltó una risa. Ella se quedó quieta unos segundos que parecieron horas. Yo no sé qué pensó en ese momento; solo vi que cerró los ojos.\n"
        "Entonces cantó. No recuerdo la canción, pero sí el silencio que vino después, y cómo la señora que se había reído fue la primera en ponerse de pie para aplaudir.\n"
        "Años más tarde, Lucía llenaba estadios. En las entrevistas nunca habló de aquella noche. Yo, en cambio, la cuento cada vez que alguien me dice que no se atreve."
    ],
    questions=[
        mc('single_choice', '¿Qué tipo de narrador cuenta la historia?',
           ['Narrador testigo', 'Narrador protagonista', 'Narrador omnisciente', 'La propia Lucía'],
           'Presencia los hechos desde el público, pero la protagonista es Lucía.'),
        mc('single_choice', '¿Qué frase muestra el límite de este narrador?',
           ['«Yo no sé qué pensó en ese momento»', '«Llovía y la sala estaba medio vacía»',
            '«Lucía llenaba estadios»', '«Salió con un vestido prestado»'],
           'Un testigo no accede a los pensamientos de otros personajes.'),
        tf('La señora que se rió fue la última en aplaudir.', False,
           'Fue «la primera en ponerse de pie para aplaudir».'),
    ],
    vocab=[('prestado', 'Que alguien lo dio para usarlo y devolverlo'), ('tropezó', 'Chocó con los pies y estuvo a punto de caer')],
    events=[
        'Lucía tropieza al llegar al micrófono.',
        'Alguien se ríe en el público.',
        'Lucía cierra los ojos y canta.',
        'La señora que se rió aplaude de pie.',
    ],
)
