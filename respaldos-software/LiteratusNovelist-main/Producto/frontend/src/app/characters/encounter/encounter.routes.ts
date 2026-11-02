import { Routes } from '@angular/router';
import { EncounterPageComponent } from './encounter-page.component';

/** /encuentro arma el encuentro (?a=&b= dejan elegidos los personajes); /encuentro/:id lo abre. */
export const ENCOUNTER_ROUTES: Routes = [
  { path: '', component: EncounterPageComponent },
  { path: ':id', component: EncounterPageComponent },
];
