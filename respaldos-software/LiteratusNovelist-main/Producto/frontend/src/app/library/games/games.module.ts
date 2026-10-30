import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { authGuard } from '../../core/guards/auth.guard';
import { enigmaExitGuard } from '../../core/guards/enigma-exit.guard';
import { GamesHubComponent } from './games-hub/games-hub.component';
import { EnigmaGameComponent } from './enigma-game/enigma-game.component';
import { BlindInterrogationComponent } from './blind-interrogation/blind-interrogation.component';

/** El Oráculo de Tinta (/games), El Enigma y el Interrogatorio. */
@NgModule({
  declarations: [GamesHubComponent, EnigmaGameComponent, BlindInterrogationComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: GamesHubComponent },
      { path: 'enigma', component: EnigmaGameComponent, canActivate: [authGuard], canDeactivate: [enigmaExitGuard] },
      { path: 'interrogatorio', component: BlindInterrogationComponent, canActivate: [authGuard], canDeactivate: [enigmaExitGuard] },
      { path: 'blind-interrogation', redirectTo: 'interrogatorio', pathMatch: 'full' },
    ]),
  ],
})
export class GamesModule {}
