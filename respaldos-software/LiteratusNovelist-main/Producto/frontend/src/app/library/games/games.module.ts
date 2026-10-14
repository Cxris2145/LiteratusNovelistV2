import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { enigmaExitGuard } from '../../core/guards/enigma-exit.guard';
import { EnigmaGameComponent } from './enigma-game/enigma-game.component';
import { BlindInterrogationComponent } from './blind-interrogation/blind-interrogation.component';

/** El Enigma y el Interrogatorio se descargan al abrir uno de los dos. */
@NgModule({
  declarations: [EnigmaGameComponent, BlindInterrogationComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: 'enigma', component: EnigmaGameComponent, canDeactivate: [enigmaExitGuard] },
      { path: 'interrogatorio', component: BlindInterrogationComponent, canDeactivate: [enigmaExitGuard] },
      { path: 'blind-interrogation', redirectTo: 'interrogatorio', pathMatch: 'full' },
    ]),
  ],
})
export class GamesModule {}
