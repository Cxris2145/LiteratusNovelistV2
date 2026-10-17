import { LearningUnit, PathChest } from '../../core/services/learning.service';

export interface PathRealm {
  number: number;
  key: string;
  title: string;
  description: string;
  icon: string;
  reward: string;
  units: LearningUnit[];
  chest?: PathChest;
}

export const PATH_REALMS: Omit<PathRealm, 'units' | 'chest'>[] = [
  { number: 1, key: 'forest', title: 'Bosque de las Primeras Páginas', description: 'Cada historia enciende una luz entre los árboles.', icon: 'forest', reward: 'Broche de luciérnaga' },
  { number: 2, key: 'lake', title: 'Lago de la Luna', description: 'Sigue las palabras que brillan sobre el agua.', icon: 'water', reward: 'Capa lunar' },
  { number: 3, key: 'library', title: 'Biblioteca Flotante', description: 'Entre islas de libros, las historias aprenden a volar.', icon: 'auto_stories', reward: 'Gorro del archivista' },
  { number: 4, key: 'ruins', title: 'Ruinas de los Relatos', description: 'Descifra los secretos que guardan las piedras.', icon: 'key', reward: 'Llave de los relatos' },
  { number: 5, key: 'aurora', title: 'Cumbres de Aurora', description: 'Encuentra nuevas historias bajo un cielo de colores.', icon: 'landscape', reward: 'Capa de aurora' },
  { number: 6, key: 'citadel', title: 'Ciudadela de Tinta', description: 'La última puerta se abre con todo lo que has aprendido.', icon: 'castle', reward: 'Corona del Gran Lector' },
];
