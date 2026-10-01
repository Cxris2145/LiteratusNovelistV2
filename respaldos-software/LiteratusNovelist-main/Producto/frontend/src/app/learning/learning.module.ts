import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LearningRoutingModule } from './learning-routing.module';
import { LearningPathComponent } from './learning-path/learning-path.component';
import { PlayLevelComponent } from './play-level/play-level.component';
import { GameOptionsComponent } from './games/game-options.component';
import { GameOrderComponent } from './games/game-order.component';
import { GameMatchComponent } from './games/game-match.component';
import { GameTilesComponent } from './games/game-tiles.component';
import { GameHuntComponent } from './games/game-hunt.component';
import { GameClassifyComponent } from './games/game-classify.component';
import { GameRapidComponent } from './games/game-rapid.component';

@NgModule({
  declarations: [
    LearningPathComponent,
    PlayLevelComponent,
    GameOptionsComponent,
    GameOrderComponent,
    GameMatchComponent,
    GameTilesComponent,
    GameHuntComponent,
    GameClassifyComponent,
    GameRapidComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    LearningRoutingModule
  ]
})
export class LearningModule { }
