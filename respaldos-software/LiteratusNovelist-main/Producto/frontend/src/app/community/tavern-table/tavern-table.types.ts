export type TavernTableAction = 'book' | 'invite' | 'rewards' | 'cat' | 'potions' | 'hourglass';

export interface TavernTableAnchor {
  action: TavernTableAction;
  x: number;
  y: number;
}
