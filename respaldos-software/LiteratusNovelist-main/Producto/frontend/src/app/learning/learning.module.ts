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
import { SharedModule } from '../shared/shared.module';
import { PathLandmarkComponent } from './learning-path/path-landmark.component';
import { PathSceneDirective } from './learning-path/path-scene.directive';
import { PathEnchantmentComponent } from './learning-path/path-enchantment.component';

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
    PathLandmarkComponent,
    PathSceneDirective,
    PathEnchantmentComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    SharedModule,
    LearningRoutingModule
  ]
})
export class LearningModule { }
